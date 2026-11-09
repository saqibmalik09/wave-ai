/**
 * Local-disk object store — the default driver until a bucket is configured.
 *
 * Files land under `UPLOAD_DIR` (default `<cwd>/.uploads`, gitignored). pm2
 * runs `next start` with the repo root as cwd, so the directory survives a
 * deploy; `git pull` never touches untracked paths.
 *
 * Three things this driver is careful about:
 *  - **Path traversal.** A key arrives from a URL on the read path. It must
 *    match `isValidObjectKey` AND resolve inside the root, or the call is
 *    refused — two independent checks, because one of them could be loosened
 *    by a future edit.
 *  - **Torn writes.** `put` writes a temp file and renames it, so a reader can
 *    never see a half-written image.
 *  - **Streaming reads.** `get` hands back a file stream, so serving a 10 MB
 *    reference does not cost 10 MB of heap.
 *
 * Nothing here logs a path, a key or a byte.
 *
 * Server-only (uses `node:fs`).
 */
import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { isValidObjectKey, type GetResult, type ObjectStore, type PutInput, type PutResult } from "./types";

export const LOCAL_STORE_ID = "local";

/** Bounds one sweep pass so cleanup can never become a long job. */
const MAX_SWEEP_SCAN = 2_000;

function root(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : path.join(process.cwd(), ".uploads");
}

/**
 * Resolves a key to an absolute path, or null when the key is malformed or
 * would escape the root.
 */
function resolveKey(key: string): string | null {
  if (!isValidObjectKey(key)) return null;
  const base = root();
  const resolved = path.resolve(base, key);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  return resolved.startsWith(prefix) ? resolved : null;
}

export const localObjectStore: ObjectStore = {
  id: LOCAL_STORE_ID,

  async put(input: PutInput): Promise<PutResult> {
    const target = resolveKey(input.key);
    if (!target) return { ok: false, reason: "invalid_key" };

    try {
      await mkdir(path.dirname(target), { recursive: true });
      // Write-then-rename: a reader never observes a partial file.
      const temp = `${target}.${Date.now()}.part`;
      await writeFile(temp, input.body, { flag: "wx" });
      await rename(temp, target);
      return { ok: true };
    } catch {
      return { ok: false, reason: "write_failed" };
    }
  },

  async get(key: string): Promise<GetResult> {
    const target = resolveKey(key);
    if (!target) return { ok: false, reason: "invalid_key" };

    try {
      const info = await stat(target);
      if (!info.isFile()) return { ok: false, reason: "not_found" };

      const stream = Readable.toWeb(
        createReadStream(target)
      ) as unknown as ReadableStream<Uint8Array>;

      return {
        ok: true,
        body: stream,
        // Derived from the key's extension, which was set from the sniffed
        // magic bytes at upload time.
        contentType: contentTypeForKey(key),
        size: info.size,
        modifiedAt: info.mtime,
      };
    } catch {
      return { ok: false, reason: "not_found" };
    }
  },

  async remove(key: string): Promise<void> {
    const target = resolveKey(key);
    if (!target) return;
    try {
      await rm(target, { force: true });
    } catch {
      // Best effort: a failed delete must never fail a request.
    }
  },

  async sweep(before: Date, limit: number): Promise<number> {
    const base = root();
    let removed = 0;
    let scanned = 0;

    try {
      const prefixes = await readdir(base, { withFileTypes: true });
      for (const prefix of prefixes) {
        if (removed >= limit || scanned >= MAX_SWEEP_SCAN) break;
        if (!prefix.isDirectory()) continue;

        const dir = path.join(base, prefix.name);
        const files = await readdir(dir, { withFileTypes: true });
        for (const file of files) {
          if (removed >= limit || scanned >= MAX_SWEEP_SCAN) break;
          if (!file.isFile()) continue;
          scanned += 1;

          const full = path.join(dir, file.name);
          try {
            const info = await stat(full);
            if (info.mtime < before) {
              await rm(full, { force: true });
              removed += 1;
            }
          } catch {
            // Raced with another sweep or a delete — skip it.
          }
        }
      }
    } catch {
      // The directory may not exist yet. Nothing to sweep.
    }

    return removed;
  },
};

/** The stored extension is authoritative; it came from the magic bytes. */
function contentTypeForKey(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
