import { NextResponse } from "next/server";
import { getObjectStore } from "@/lib/storage";
import { verifyUploadKey } from "@/lib/storage/signing";

/**
 * Serves an uploaded reference image to whoever holds the signed URL.
 *
 * Deliberately NOT behind the session guard: the generation provider fetches
 * this URL itself and has no cookie. The URL is the capability instead — an
 * unguessable key plus an HMAC over `<key>.<exp>`, so it cannot be forged or
 * enumerated, and it stops working at the expiry baked into the signature.
 * That expiry check on read is the authoritative TTL; the sweeper only
 * reclaims disk.
 *
 * Response hardening, because this serves user-supplied bytes from our own
 * origin: the `Content-Type` comes from the magic bytes detected at upload
 * time (never the uploader's header), `nosniff` stops a browser re-guessing
 * it, and a `default-src 'none'; sandbox` CSP neuters anything that somehow
 * got through the sniffer.
 *
 * GET /api/ai/uploads/<prefix>/<name>.<ext>?exp=<unix>&sig=<hex>
 *   200 - the image bytes (streamed)
 *   404 - unknown, malformed, or badly signed
 *   410 - correctly signed but expired
 */

/** Immutable content; cache for the signature's remaining life, privately. */
const MAX_BROWSER_CACHE_SECONDS = 300;

function notFound() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: segments } = await params;
  // `isValidObjectKey` (inside verifyUploadKey) enforces the exact two-segment
  // shape, so a traversal attempt cannot even reach the store.
  const key = (segments ?? []).join("/");
  if (!key) return notFound();

  const url = new URL(request.url);
  const verified = await verifyUploadKey(
    key,
    url.searchParams.get("exp"),
    url.searchParams.get("sig")
  );
  if (!verified.ok) {
    // A valid signature proves the caller held a real URL, so "expired" is
    // safe to disclose; everything else is an undifferentiated 404.
    if (verified.reason === "expired") {
      return NextResponse.json(
        { error: "This reference image has expired." },
        { status: 410 }
      );
    }
    return notFound();
  }

  const store = getObjectStore();
  if (!store) return notFound();

  const object = await store.get(key);
  if (!object.ok) return notFound();

  const remainingSeconds = Math.max(
    0,
    Math.floor((verified.expiresAtMs - Date.now()) / 1000)
  );

  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.size),
      "cache-control": `private, max-age=${Math.min(remainingSeconds, MAX_BROWSER_CACHE_SECONDS)}`,
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "referrer-policy": "no-referrer",
    },
  });
}
