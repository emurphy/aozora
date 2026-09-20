import type { GlossStyle } from "@/lib/types";

/**
 * Marks an element as holding one dictionary's glosses, so that dictionary's
 * `styles.css` can be scoped to it: injected into the page for the popup
 * (src/lib/dictionary/dict-styles.ts), inlined into the note type for Anki
 * (src/lib/dictionary/anki-model.ts).
 */
export const DICT_SCOPE_ATTR = "data-aoz-dict";

/**
 * Maps a node's `data` field to `data-sc-*` attributes, matching Yomitan's
 * dataset convention (`{content:"x"}` → `data-sc-content="x"`). A rich
 * dictionary's stylesheet targets these, so they're what make its tag badges
 * and cross-reference boxes render.
 */
export function glossDataAttrs(data: Record<string, string> | undefined): Record<string, string> {
  if (!data) return {};
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!key || typeof value !== "string") continue;
    const kebab = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    attrs[`data-sc-${kebab}`] = value;
  }
  return attrs;
}

/**
 * Maps a structured-content `style` object onto CSS declarations, keyed the way
 * React wants them (camelCase). Port of Yomitan's structured-content style
 * handling (references/yomitan/ext/js/display/structured-content-generator.js).
 *
 * Shared by the popup, which hands the result to React, and the Anki exporter,
 * which serializes it to an inline `style` attribute: a card carries no
 * dictionary stylesheet, so the author's inline styling is all it has.
 */
export function glossStyleDeclarations(style: GlossStyle | undefined): Record<string, string> | undefined {
  if (!style) return undefined;
  const css: Record<string, string> = {};
  const set = (key: string, value: string | undefined) => {
    if (typeof value === "string" && value.length > 0) css[key] = value;
  };
  // Yomitan writes bare numbers for margins, meaning em.
  const em = (key: string, value: number | string | undefined) => {
    if (typeof value === "number") css[key] = `${value}em`;
    else if (typeof value === "string") css[key] = value;
  };

  set("fontStyle", style.fontStyle);
  set("fontWeight", style.fontWeight);
  set("fontSize", style.fontSize);
  set("color", style.color);
  set("background", style.background);
  set("backgroundColor", style.backgroundColor);
  set("verticalAlign", style.verticalAlign);
  set("textAlign", style.textAlign);
  set("textEmphasis", style.textEmphasis);
  set("textShadow", style.textShadow);
  if (typeof style.textDecorationLine === "string") set("textDecoration", style.textDecorationLine);
  else if (Array.isArray(style.textDecorationLine)) css.textDecoration = style.textDecorationLine.join(" ");
  set("textDecorationStyle", style.textDecorationStyle);
  set("textDecorationColor", style.textDecorationColor);
  set("borderColor", style.borderColor);
  set("borderStyle", style.borderStyle);
  set("borderRadius", style.borderRadius);
  set("borderWidth", style.borderWidth);
  set("margin", style.margin);
  em("marginTop", style.marginTop);
  em("marginLeft", style.marginLeft);
  em("marginRight", style.marginRight);
  em("marginBottom", style.marginBottom);
  set("padding", style.padding);
  set("paddingTop", style.paddingTop);
  set("paddingLeft", style.paddingLeft);
  set("paddingRight", style.paddingRight);
  set("paddingBottom", style.paddingBottom);
  set("wordBreak", style.wordBreak);
  set("whiteSpace", style.whiteSpace);
  set("listStyleType", style.listStyleType);

  return Object.keys(css).length ? css : undefined;
}

/** Serializes those declarations to an inline `style` attribute value. */
export function inlineCss(css: Record<string, string>): string {
  return Object.entries(css)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value}`)
    .join("; ");
}
