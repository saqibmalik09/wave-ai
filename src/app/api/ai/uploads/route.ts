import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { getUserById } from "@/lib/auth/store";
import { UPLOAD_MAX_BYTES } from "@/lib/ai/types";
import { getObjectStore } from "@/lib/storage";
import { sniffImage } from "@/lib/storage/imageType";
import { FixedWindowRateLimiter } from "@/lib/storage/rateLimit";
import {
  buildUploadUrl,
  issuingOrigin,
  randomObjectName,
  uploadTtlMs,
  userKeyPrefix,
} from "@/lib/storage/signing";

/**
 * Upload ONE reference image and get back a signed, expiring URL that
 * `POST /api/ai/generate` will accept in `referenceImageUrls`.
 *
 * This replaces inlining images as `data:` URLs in the generate body, which
 * meant up to 7 x 10 MB base64-expanded (≈ 94 MB) in a single JSON POST.
 *
 * Request:  multipart/form-data, one `file` field.
 * Response: 201 `UploadedReferenceDTO` = { url, expiresAt, contentType, size }.
 *
 * How this endpoint refuses to be abused:
 *  - the declared `Content-Length` is checked BEFORE the body is touched, and
 *    the body is then read through a running byte counter, so a lying or
 *    absent length cannot buffer more than the cap,
 *  - the container is identified from MAGIC BYTES; the client's `Content-Type`
 *    and filename are never trusted and the filename is never stored,
 *  - the object name is 16 random bytes under a keyed per-user prefix, so keys
 *    are unguessable and user ids never appear in a URL,
 *  - a bounded per-user rate limit keeps one account from filling the disk.
 *
 * Nothing here logs bytes, the client's filename, or a secret.
 */

/** Multipart framing overhead on top of the file itself. */
const MAX_ENVELOPE_BYTES = UPLOAD_MAX_BYTES + 64 * 1024;

const RATE_LIMIT = new FixedWindowRateLimiter({
  windowMs: 10 * 60_000,
  max: 30,
});

/** Best-effort cleanup runs at most this often per process. */
const SWEEP_INTERVAL_MS = 5 * 60_000;
/** Deletions per sweep pass — bounded so cleanup never becomes a long job. */
const SWEEP_LIMIT = 200;
/** Grace period past the URL's expiry before a file is eligible for deletion. */
const SWEEP_GRACE_MS = 60 * 60_000;

let lastSweepAt = 0;

/**
 * Deletes expired objects, at most once per `SWEEP_INTERVAL_MS` per process.
 *
 * The repo has no scheduler, so cleanup rides along with uploads: expiry is
 * already enforced on READ by the signature, this just stops the directory
 * growing forever. Fire-and-forget and fully swallowed — a failed sweep must
 * never affect the upload that triggered it.
 */
function sweepExpiredInBackground(): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;

  const store = getObjectStore();
  if (!store) return;

  const before = new Date(now - uploadTtlMs() - SWEEP_GRACE_MS);
  void store.sweep(before, SWEEP_LIMIT).catch(() => undefined);
}

/** Reads the body with a hard byte cap. Returns null when the cap is passed. */
async function readBodyCapped(
  body: ReadableStream<Uint8Array>
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_ENVELOPE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function tooLarge() {
  return NextResponse.json(
    {
      error: `Reference images must be under ${Math.floor(UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`,
    },
    { status: 413 }
  );
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (session.role === "guest" || session.email === null) {
    return NextResponse.json(
      { error: "Create an account to upload reference images." },
      { status: 403 }
    );
  }

  // One indexed point read — uploads are not a per-frame path, and a suspended
  // account must not be able to write to our disk. Fails closed.
  const account = await getUserById(session.id);
  if (!account || account.status !== "ACTIVE") {
    return NextResponse.json({ error: "Account is not active." }, { status: 403 });
  }

  const limit = RATE_LIMIT.consume(session.id);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many uploads. Try again in a few minutes.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return NextResponse.json(
      { error: "Send multipart/form-data with a single 'file' field." },
      { status: 415 }
    );
  }

  // Cheapest rejection first: believe a declared length that is too big, but
  // never believe one that is small enough.
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_ENVELOPE_BYTES) {
    return tooLarge();
  }
  if (!request.body) {
    return NextResponse.json(
      { error: "Send multipart/form-data with a single 'file' field." },
      { status: 400 }
    );
  }

  const raw = await readBodyCapped(request.body);
  if (raw === null) return tooLarge();

  let form: FormData;
  try {
    // Parse the already-bounded bytes with the platform's multipart parser
    // rather than hand-rolling one.
    form = await new Response(raw, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return NextResponse.json(
      { error: "Send multipart/form-data with a single 'file' field." },
      { status: 400 }
    );
  }

  const field = form.get("file");
  if (!(field instanceof Blob)) {
    return NextResponse.json(
      { error: "Send multipart/form-data with a single 'file' field." },
      { status: 400 }
    );
  }
  if (field.size === 0) {
    return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  }
  if (field.size > UPLOAD_MAX_BYTES) return tooLarge();

  const bytes = new Uint8Array(await field.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) {
    // The magic bytes decide. A renamed SVG/HTML/zip lands here.
    return NextResponse.json(
      { error: "Reference images must be PNG, JPEG or WebP." },
      { status: 415 }
    );
  }

  const store = getObjectStore();
  if (!store) {
    // STORAGE_DRIVER names a driver that is not installed — fail closed rather
    // than writing production uploads somewhere unexpected.
    return NextResponse.json(
      { error: "Uploads are unavailable right now." },
      { status: 503 }
    );
  }

  let url: string;
  let expiresAt: Date;
  try {
    const prefix = await userKeyPrefix(session.id);
    const key = `${prefix}/${randomObjectName(kind.extension)}`;

    const stored = await store.put({
      key,
      body: bytes,
      contentType: kind.contentType,
    });
    if (!stored.ok) {
      return NextResponse.json(
        { error: "Upload failed. Try again." },
        { status: 500 }
      );
    }

    expiresAt = new Date(Date.now() + uploadTtlMs());
    url = await buildUploadUrl(issuingOrigin(request), key, expiresAt.getTime());
  } catch {
    // Signing needs AUTH_SECRET; never leak which part failed.
    return NextResponse.json(
      { error: "Upload failed. Try again." },
      { status: 500 }
    );
  }

  sweepExpiredInBackground();

  return NextResponse.json(
    {
      url,
      expiresAt: expiresAt.toISOString(),
      contentType: kind.contentType,
      size: bytes.byteLength,
    },
    { status: 201, headers: { "cache-control": "no-store" } }
  );
}
