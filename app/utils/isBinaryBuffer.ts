/**
 * Best-effort binary detection without Node `Buffer` or `istextorbinary` (browser-safe).
 */
export function isBinaryBuffer(buffer: Uint8Array | undefined): boolean {
  if (!buffer || buffer.byteLength === 0) {
    return false;
  }

  const n = Math.min(buffer.byteLength, 8000);
  for (let i = 0; i < n; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }

  return false;
}
