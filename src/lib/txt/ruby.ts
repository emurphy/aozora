/**
 * Aozora Bunko ruby: `漢字《かんじ》` attaches the reading to the run of text
 * before it, and `｜` starts that run explicitly.
 *
 * Without `｜` the run extends backwards while the characters stay in the same
 * class as the one touching `《`. That rule is why the reference file has to
 * write `却々｜眉目秀麗《ハンサム》`: 却々眉目秀麗 is one unbroken kanji run, so
 * the whole thing would otherwise take the reading.
 */

export type CharClass = "kanji" | "hiragana" | "katakana" | "latin" | "other";

// 々〆〇ヶヵ read as part of the kanji run (三ヶ月, 佐々木), not as their own class.
const KANJI = /[々-〇ヵヶ㐀-䶿一-鿿豈-﫿]|[\uD840-\uD87F][\uDC00-\uDFFF]/;
const HIRAGANA = /[ぁ-ゟ]/;
const KATAKANA = /[゠-ヿㇰ-ㇿｦ-ﾟ]/;
const LATIN = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/;

export function charClass(char: string): CharClass {
  if (KANJI.test(char)) return "kanji";
  if (HIRAGANA.test(char)) return "hiragana";
  if (KATAKANA.test(char)) return "katakana";
  if (LATIN.test(char)) return "latin";
  return "other";
}

/**
 * Start of the ruby base ending at `end` (exclusive), as an index into `chars`.
 * Returns `end` when the preceding character can carry no reading, which leaves
 * the `《…》` to be emitted as the literal text it is.
 */
export function rubyBaseStart(chars: string[], end: number): number {
  if (end <= 0) return end;

  const cls = charClass(chars[end - 1]);
  if (cls === "other") return end;

  let start = end - 1;
  while (start > 0 && charClass(chars[start - 1]) === cls) start--;
  return start;
}
