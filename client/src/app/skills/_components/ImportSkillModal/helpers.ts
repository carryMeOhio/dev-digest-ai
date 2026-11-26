/** Pure helpers for the skill import flow. */

/** Chunk size for base64 encoding — small enough to not blow the call stack. */
const CHUNK = 0x8000;

/**
 * Base64-encode file bytes for the JSON upload envelope.
 *
 * Chunked on purpose: `String.fromCharCode(...bytes)` passes every byte as an
 * argument, which throws RangeError on a file of any real size. A .zip skill
 * pack trips that immediately.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Extensions the import route accepts; used for the file picker and the hint. */
export const ACCEPTED_EXTENSIONS = ".md,.markdown,.zip";
