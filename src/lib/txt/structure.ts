/**
 * Splits an Aozora Bunko text file into its three parts: the title/author
 * header, the body, and the colophon. The layout is fixed by the archive's own
 * template, so this is a shape match, not a guess:
 *
 *     タイトル
 *     著者名
 *     <blank>
 *     -------------------------------------------------------
 *     【テキスト中に現れる記号について】        <- notation legend
 *     -------------------------------------------------------
 *     <body>
 *     底本：「…」…                              <- colophon
 */

export interface AozoraText {
  title: string;
  author: string;
  /** Body lines, legend and colophon removed, outer blank lines trimmed. */
  lines: string[];
}

const SEPARATOR = /^-{10,}$/;
const COLOPHON = /^底本[：:]/;

/** How far in the legend may start; past that a rule of dashes is prose. */
const HEADER_LIMIT = 40;

export function splitAozoraText(text: string): AozoraText {
  // JS \s covers the ideographic space, which is what pads these lines.
  const lines = text.split("\n").map((line) => line.replace(/\s+$/, ""));

  let headerEnd = -1;
  let bodyStart = 0;

  const legendStart = lines.findIndex((line, i) => i < HEADER_LIMIT && SEPARATOR.test(line));
  if (legendStart >= 0) {
    const legendEnd = lines.findIndex((line, i) => i > legendStart && SEPARATOR.test(line));
    headerEnd = legendStart;
    bodyStart = legendEnd >= 0 ? legendEnd + 1 : legendStart + 1;
  } else {
    // No legend: files without ruby or gaiji omit it, but still separate the
    // header from the body with a blank line.
    const blank = lines.findIndex((line, i) => i < 6 && !line.trim());
    if (blank > 0) {
      headerEnd = blank;
      bodyStart = blank + 1;
    }
  }

  const colophon = lines.findIndex((line, i) => i >= bodyStart && COLOPHON.test(line));
  const header = headerEnd < 0 ? [] : lines.slice(0, headerEnd).filter((line) => line.trim());

  return {
    title: header[0] ?? "",
    author: header.length > 1 ? header[header.length - 1] : "",
    lines: trimBlank(lines.slice(bodyStart, colophon < 0 ? undefined : colophon)),
  };
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}
