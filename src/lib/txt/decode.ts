/**
 * Aozora Bunko ships its text files in Shift_JIS; mirrors and hand-made copies
 * are usually UTF-8. A wrong guess corrupts every line, and the two are cheap to
 * tell apart, so the encoding is probed instead of assumed.
 */
export function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return normalize(decode(bytes.subarray(3), "utf-8"));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return normalize(decode(bytes.subarray(2), "utf-16le"));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return normalize(decode(bytes.subarray(2), "utf-16be"));

  // Shift_JIS text is almost never valid UTF-8, so a strict UTF-8 decode is the
  // discriminator: it throws on the first byte pair that isn't.
  try {
    return normalize(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return normalize(decode(bytes, "shift_jis"));
  }
}

function decode(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes);
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
