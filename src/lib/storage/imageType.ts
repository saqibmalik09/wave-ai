/**
 * Image type detection from MAGIC BYTES.
 *
 * The client-sent `Content-Type` and the filename extension are both
 * attacker-controlled, so neither is consulted. We read the first bytes of the
 * file and only accept the three containers we actually support. Anything else
 * — an SVG (scriptable), an HTML file renamed to .png, a zip, a truncated
 * header — is rejected before a single byte is written to disk.
 *
 * Pure and dependency-free.
 */

export type ImageKind = {
  contentType: "image/png" | "image/jpeg" | "image/webp";
  /** Extension stored in the object key; the read path derives the type from it. */
  extension: "png" | "jpg" | "webp";
};

/** Smallest prefix that can identify any supported container. */
const MIN_HEADER_BYTES = 12;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** JPEG SOI + the first marker byte. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
/** "RIFF" at offset 0. */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
/** "WEBP" at offset 8. */
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

function matches(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0
): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** The detected kind, or null when the bytes are not a supported image. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < MIN_HEADER_BYTES) return null;

  if (matches(bytes, PNG_SIGNATURE)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (matches(bytes, JPEG_SIGNATURE)) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    matches(bytes, RIFF_SIGNATURE) &&
    matches(bytes, WEBP_SIGNATURE, 8)
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}
