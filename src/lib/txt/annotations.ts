import { jisX0213Char } from "./jisx0213";

/**
 * Aozora Bunko input-worker notes, `［＃…］`, and the gaiji form `※［＃…］`.
 * The full notation set is large and mostly typographic; what is parsed here is
 * what changes the reading experience. Anything else resolves to `drop`, which
 * removes the note and keeps the surrounding text.
 */

export type EmphasisStyle = "sesame" | "underline" | "bold" | "italic";
export type HeadingLevel = 2 | 3 | 4;

export type Annotation =
  /** A character outside the file's charset, cited by JIS X 0213 men-ku-ten or Unicode. */
  | { kind: "gaiji"; char: string | null; note: string }
  /** Applies to the text before the note, quoted inside it. */
  | { kind: "emphasis"; target: string; style: EmphasisStyle }
  | { kind: "heading"; target: string; level: HeadingLevel }
  | { kind: "heading-start"; level: HeadingLevel }
  | { kind: "heading-end" }
  | { kind: "page-break" }
  | { kind: "indent-start"; width: number }
  | { kind: "indent-end" }
  | { kind: "line-indent"; width: number }
  | { kind: "drop" };

const HEADING_LEVELS: Record<string, HeadingLevel> = { 大: 2, 中: 3, 小: 4 };

/** Full-width digits appear in notes as often as ASCII ones. */
function toNumber(digits: string): number {
  return Number(digits.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10)));
}

function quoted(body: string): string {
  return /「(.+?)」/s.exec(body)?.[1] ?? "";
}

/**
 * Resolves the character a gaiji note stands for. `U+XXXX` is used directly;
 * otherwise the men-ku-ten triple (`第3水準1-92-36`, sometimes bare) goes through
 * the JIS X 0213 table. Unresolvable notes keep their description as the label.
 */
function parseGaiji(body: string): Annotation {
  const note = quoted(body) || body.split(/[、,]/)[0].trim();

  const unicode = /U\+([0-9A-Fa-f]{4,6})/.exec(body);
  if (unicode) return { kind: "gaiji", char: String.fromCodePoint(parseInt(unicode[1], 16)), note };

  const menKuTen = /(?:第[34]水準)?\s*([12])-(\d{1,2})-(\d{1,2})/.exec(body);
  if (menKuTen) {
    return { kind: "gaiji", char: jisX0213Char(Number(menKuTen[1]), Number(menKuTen[2]), Number(menKuTen[3])), note };
  }

  return { kind: "gaiji", char: null, note };
}

export function parseAnnotation(body: string, gaiji: boolean): Annotation {
  if (gaiji) return parseGaiji(body);

  // An editor's remark about the source book, not part of the prose.
  if (/底本では|ママ/.test(body)) return { kind: "drop" };

  const emphasis = /^「(.+?)」に(.+)$/s.exec(body);
  if (emphasis) {
    const style = emphasisStyle(emphasis[2]);
    return style ? { kind: "emphasis", target: emphasis[1], style } : { kind: "drop" };
  }

  const heading = /^「(.+?)」は(?:同行)?([大中小])見出し$/s.exec(body);
  if (heading) return { kind: "heading", target: heading[1], level: HEADING_LEVELS[heading[2]] };

  if (/^ここで[大中小]見出し終わり$|^[大中小]見出し終わり$/.test(body)) return { kind: "heading-end" };

  const headingStart = /^(?:ここから)?([大中小])見出し$/.exec(body);
  if (headingStart) return { kind: "heading-start", level: HEADING_LEVELS[headingStart[1]] };

  if (/^改(ページ|丁|段|頁)$/.test(body)) return { kind: "page-break" };

  if (/^ここで字下げ終わり$/.test(body)) return { kind: "indent-end" };

  const indentStart = /^ここから([0-9０-９]+)字下げ$/.exec(body);
  if (indentStart) return { kind: "indent-start", width: toNumber(indentStart[1]) };

  const lineIndent = /^([0-9０-９]+)字下げ$/.exec(body);
  if (lineIndent) return { kind: "line-indent", width: toNumber(lineIndent[1]) };

  return { kind: "drop" };
}

function emphasisStyle(suffix: string): EmphasisStyle | null {
  if (/傍点/.test(suffix)) return "sesame";
  if (/傍線/.test(suffix)) return "underline";
  if (/太字/.test(suffix)) return "bold";
  if (/斜体/.test(suffix)) return "italic";
  return null;
}
