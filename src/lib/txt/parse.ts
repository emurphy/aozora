import { escapeHtml } from "@/lib/dictionary/escape";
import { parseAnnotation, type HeadingLevel } from "./annotations";
import { renderLine } from "./inline";

/**
 * Turns Aozora Bunko body lines into chapters of XHTML. One line is one
 * paragraph; notes that govern a whole line or a run of them (page breaks,
 * 字下げ blocks, headings) are handled here, the rest inside the line.
 *
 * A chapter is both a spine item and a TOC entry downstream, so a new one starts
 * at every heading and every 改ページ.
 */

export interface TxtChapter {
  id: string;
  href: string;
  label: string | null;
  xhtml: string;
}

/** Notes that act on the line or the block, stripped before the line is rendered. */
const BLOCK_KINDS = new Set(["page-break", "indent-start", "indent-end", "heading-start", "heading-end", "line-indent"]);

const ANNOTATION = /(※?)［＃(.+?)］/g;

export function parseAozoraBody(lines: string[]): TxtChapter[] {
  const chapters: TxtChapter[] = [];
  let parts: string[] = [];
  let label: string | null = null;

  let indent = 0;
  let headingBlock: HeadingLevel | null = null;

  const flush = (nextLabel: string | null) => {
    if (parts.length) chapters.push(chapter(chapters.length, label, parts));
    parts = [];
    label = nextLabel;
  };

  for (const line of lines) {
    let text = line;
    let pageBreak = false;
    let lineIndent = 0;

    ANNOTATION.lastIndex = 0;
    text = text.replace(ANNOTATION, (match, gaiji: string, body: string) => {
      const annotation = parseAnnotation(body, gaiji === "※");
      if (!BLOCK_KINDS.has(annotation.kind)) return match;

      if (annotation.kind === "page-break") pageBreak = true;
      else if (annotation.kind === "indent-start") indent = annotation.width;
      else if (annotation.kind === "indent-end") indent = 0;
      else if (annotation.kind === "line-indent") lineIndent = annotation.width;
      else if (annotation.kind === "heading-start") headingBlock = annotation.level;
      else if (annotation.kind === "heading-end") headingBlock = null;
      return "";
    });

    if (pageBreak) flush(null);

    if (!text.trim()) {
      // A blank line is authored spacing, so it keeps its line rather than
      // collapsing the paragraphs around it.
      if (parts.length) parts.push('<p class="aoz-txt-blank"><br /></p>');
      continue;
    }

    const rendered = renderLine(text);
    const level = rendered.heading?.level ?? headingBlock;

    if (level) {
      flush(rendered.heading?.label || rendered.text.trim());
      parts.push(`<h${level}>${rendered.html}</h${level}>`);
      continue;
    }

    const width = lineIndent || indent;
    parts.push(width ? `<p style="padding-inline-start:${width}em">${rendered.html}</p>` : `<p>${rendered.html}</p>`);
  }

  flush(null);
  return chapters;
}

function chapter(index: number, label: string | null, parts: string[]): TxtChapter {
  const id = `c${String(index + 1).padStart(4, "0")}`;
  return {
    id,
    href: `${id}.xhtml`,
    label,
    xhtml: `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeHtml(label ?? "")}</title></head><body>${parts.join("")}</body></html>`,
  };
}
