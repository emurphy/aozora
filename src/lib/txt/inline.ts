import { escapeHtml } from "@/lib/dictionary/escape";
import { parseAnnotation, type Annotation, type EmphasisStyle, type HeadingLevel } from "./annotations";
import { rubyBaseStart } from "./ruby";

/**
 * Renders one body line to HTML: ruby, gaiji, and the notes that decorate text
 * already emitted (`［＃「云った」に傍点］`).
 *
 * Those backward-referencing notes quote the source text, which by then may
 * carry ruby, so the line is built as tokens that keep their plain text beside
 * their markup. The quoted string is matched against that plain text, never
 * against the raw line.
 */

type Token =
  | { kind: "text"; text: string }
  /** Markup that owns its plain text and cannot be split (ruby, gaiji). */
  | { kind: "node"; html: string; text: string }
  /** Zero-width markup inserted around a range. */
  | { kind: "tag"; html: string };

const EMPHASIS_TAG: Record<EmphasisStyle, { open: string; close: string }> = {
  sesame: { open: '<em class="aoz-txt-sesame">', close: "</em>" },
  underline: { open: '<span class="aoz-txt-underline">', close: "</span>" },
  bold: { open: "<strong>", close: "</strong>" },
  italic: { open: "<em>", close: "</em>" },
};

export interface InlineLine {
  html: string;
  text: string;
  heading: { level: HeadingLevel; label: string } | null;
}

export function renderLine(line: string): InlineLine {
  const chars = Array.from(line);
  const tokens: Token[] = [];
  /** Notes to apply once the line is built, with where the quoted text must end. */
  const deferred: { annotation: Annotation; before: number }[] = [];

  let pipeAt: number | null = null;
  let i = 0;

  while (i < chars.length) {
    const char = chars[i];

    if (char === "｜" && chars.indexOf("《", i) > i) {
      pipeAt = plainLength(tokens);
      i++;
      continue;
    }

    if (char === "《") {
      const close = chars.indexOf("》", i);
      if (close > i) {
        const reading = chars.slice(i + 1, close).join("");
        const from = pipeAt ?? rubyBaseStart(Array.from(plainText(tokens)), plainLength(tokens));
        const base = takeTail(tokens, plainLength(tokens) - from);
        if (base) {
          tokens.push({ kind: "node", html: `<ruby>${escapeHtml(base)}<rt>${escapeHtml(reading)}</rt></ruby>`, text: base });
          pipeAt = null;
          i = close + 1;
          continue;
        }
      }
    }

    const gaiji = char === "※" && chars[i + 1] === "［" && chars[i + 2] === "＃";
    if (gaiji || (char === "［" && chars[i + 1] === "＃")) {
      const close = chars.indexOf("］", i);
      if (close > i) {
        const body = chars.slice(i + (gaiji ? 3 : 2), close).join("");
        apply(parseAnnotation(body, gaiji), tokens, deferred);
        i = close + 1;
        continue;
      }
    }

    pushText(tokens, char);
    i++;
  }

  let heading: InlineLine["heading"] = null;
  for (const { annotation, before } of deferred) {
    if (annotation.kind === "emphasis") {
      const range = findTarget(tokens, annotation.target, before);
      if (range) wrapRange(tokens, range, EMPHASIS_TAG[annotation.style].open, EMPHASIS_TAG[annotation.style].close);
    } else if (annotation.kind === "heading") {
      heading = { level: annotation.level, label: annotation.target };
    }
  }

  return { html: render(tokens), text: plainText(tokens), heading };
}

function apply(annotation: Annotation, tokens: Token[], deferred: { annotation: Annotation; before: number }[]): void {
  if (annotation.kind === "gaiji") {
    // 〓 is the printer's mark for a glyph the typesetter lacked, which is what an
    // unresolvable note describes; its description stays reachable as the title.
    const html = annotation.char ? escapeHtml(annotation.char) : `<span class="aoz-txt-gaiji" title="${escapeHtml(annotation.note)}">〓</span>`;
    tokens.push({ kind: "node", html, text: annotation.char ?? "〓" });
    return;
  }
  if (annotation.kind === "emphasis" || annotation.kind === "heading") {
    deferred.push({ annotation, before: plainLength(tokens) });
  }
}

function pushText(tokens: Token[], char: string): void {
  const last = tokens[tokens.length - 1];
  if (last?.kind === "text") last.text += char;
  else tokens.push({ kind: "text", text: char });
}

function plainText(tokens: Token[]): string {
  return tokens.reduce((acc, token) => acc + (token.kind === "tag" ? "" : token.text), "");
}

function plainLength(tokens: Token[]): number {
  return Array.from(plainText(tokens)).length;
}

/**
 * Removes and returns the last `count` characters of plain text. Returns null
 * when they do not sit wholly in splittable text tokens, which leaves the `《…》`
 * that asked for them to be emitted literally.
 */
function takeTail(tokens: Token[], count: number): string | null {
  if (count <= 0) return null;

  let taken = "";
  while (Array.from(taken).length < count) {
    const last = tokens[tokens.length - 1];
    if (last?.kind !== "text") return null;

    const chars = Array.from(last.text);
    const need = count - Array.from(taken).length;
    if (chars.length <= need) {
      taken = last.text + taken;
      tokens.pop();
    } else {
      taken = chars.slice(chars.length - need).join("") + taken;
      last.text = chars.slice(0, chars.length - need).join("");
    }
  }
  return taken;
}

/** Character range of the last occurrence of `text` ending at or before `before`. */
function findTarget(tokens: Token[], text: string, before: number): { start: number; end: number } | null {
  if (!text) return null;
  const haystack = Array.from(plainText(tokens)).slice(0, before).join("");
  const at = haystack.lastIndexOf(text);
  if (at < 0) return null;
  return { start: Array.from(haystack.slice(0, at)).length, end: Array.from(haystack.slice(0, at + text.length)).length };
}

/** Inserts markup around a character range, splitting text tokens and snapping
 *  outwards around ruby or gaiji so neither is cut in half. */
function wrapRange(tokens: Token[], range: { start: number; end: number }, open: string, close: string): void {
  const closeAt = splitAt(tokens, range.end, "after");
  tokens.splice(closeAt, 0, { kind: "tag", html: close });
  const openAt = splitAt(tokens, range.start, "before");
  tokens.splice(openAt, 0, { kind: "tag", html: open });
}

/** Token index at a plain-text offset, splitting a text token when the offset
 *  falls inside it. `snap` decides which way an unsplittable token goes. */
function splitAt(tokens: Token[], offset: number, snap: "before" | "after"): number {
  let seen = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind === "tag") continue;

    const length = Array.from(token.text).length;
    if (seen === offset) return index;
    if (seen + length > offset) {
      if (token.kind !== "text") return snap === "before" ? index : index + 1;
      const chars = Array.from(token.text);
      const cut = offset - seen;
      token.text = chars.slice(0, cut).join("");
      tokens.splice(index + 1, 0, { kind: "text", text: chars.slice(cut).join("") });
      return index + 1;
    }
    seen += length;
  }
  return tokens.length;
}

function render(tokens: Token[]): string {
  return tokens.reduce((acc, token) => acc + (token.kind === "text" ? escapeHtml(token.text) : token.html), "");
}
