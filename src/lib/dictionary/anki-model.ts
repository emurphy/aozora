import type { AnkiModelSpec } from "@/lib/types";
import { DICT_SCOPE_ATTR } from "@/lib/dictionary/gloss-style";

/**
 * The note types Aozora can create in Anki, so mining works without hand-mapping
 * markers to someone else's note type. Each spec carries its fields, the
 * `{marker}` template for each one, the card templates and the styling; the main
 * process creates the model, or refreshes the templates + CSS of one already
 * there (see src/main/anki.ts).
 *
 * `withDictionaryStyles` appends the imported dictionaries' own `styles.css` to
 * the card CSS, each scoped to its dictionary, which is what makes a rich
 * dictionary's tag badges and cross-reference boxes look on a card the way they
 * look in the popup.
 */

// Palette mirrors the app's warm paper theme (src/index.css), in hex rather than
// oklch: Anki's older Qt WebEngine builds drop oklch declarations entirely.
const CARD_CSS = `.card {
  --bg: #faf8f3;
  --fg: #302c27;
  --panel: #fefdfa;
  --muted: #7a7268;
  --line: #e0dace;
  --mark: #b06024;
  background-color: var(--bg);
  color: var(--fg);
  font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Segoe UI", -apple-system, sans-serif;
  font-size: 19px;
  line-height: 1.75;
  text-align: center;
  padding: 26px 18px 34px;
}

.card.nightMode, .card.night_mode {
  --bg: #211f1c;
  --fg: #dcd7cd;
  --panel: #2a2724;
  --muted: #a49c90;
  --line: #3a3631;
  --mark: #d99a58;
}

.aozora { margin: 0 auto; max-width: 36em; }

.target { font-size: 2.1em; line-height: 1.4; font-weight: 500; }
.sentence { margin-top: 14px; font-size: 1.05em; line-height: 2.1; }
.sentence b { font-weight: 600; border-bottom: 2px solid var(--mark); padding-bottom: 2px; }

hr#answer { height: 0; border: 0; border-top: 1px solid var(--line); margin: 22px 0 20px; }

.headword { font-size: 2.1em; line-height: 1.5; font-weight: 500; }
.headword rt { font-size: 0.38em; font-weight: 400; color: var(--muted); }

.pitch { color: var(--muted); }
.pitch svg { height: 40px; width: auto; vertical-align: middle; }
.pitch svg + svg { margin-left: 14px; }

.pos { margin-top: 6px; font-size: 0.58em; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
.chip { display: inline-block; margin-top: 10px; border: 1px solid var(--line); padding: 1px 9px; font-size: 0.56em; letter-spacing: 0.08em; color: var(--muted); }
.chip + .chip { margin-left: 6px; }

.meaning { margin-top: 16px; border: 1px solid var(--line); background-color: var(--panel); padding: 14px 18px; text-align: left; font-size: 0.84em; line-height: 1.7; }
.meaning ol, .meaning ul { margin: 0; padding-left: 1.4em; }
.meaning li + li { margin-top: 3px; }
.meaning table { border-collapse: collapse; margin: 6px 0; }
.meaning td, .meaning th { border: 1px solid var(--line); padding: 2px 8px; }
.meaning img { max-width: 100%; }

.kanji { font-size: 4.2em; line-height: 1.25; font-weight: 500; }
.kanji-meaning { font-size: 0.92em; }
.readings { margin-top: 10px; font-size: 0.8em; }
.readings .label { display: inline-block; min-width: 3.6em; font-size: 0.68em; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }

.source { margin-top: 18px; font-size: 0.54em; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
`;

/** Vocabulary note type: sentence on the front, the word and its entry behind. */
export const TERM_MODEL: AnkiModelSpec = {
  name: "Aozora",
  cardName: "Recognition",
  // Word first: Anki checks the first field for duplicates.
  fields: ["Word", "Reading", "Furigana", "Sentence", "Meaning", "Part of speech", "Pitch", "Frequency", "Source"],
  templates: {
    Word: "{expression}",
    Reading: "{reading}",
    Furigana: "{furigana}",
    Sentence: "{sentence-marked}",
    Meaning: "{glossary}",
    "Part of speech": "{part-of-speech}",
    Pitch: "{pitch-accent-graphs}",
    Frequency: "{frequencies}",
    Source: "{document-title}",
  },
  front: `<div class="aozora">
<div class="target">{{Word}}</div>
{{#Sentence}}<div class="sentence">{{Sentence}}</div>{{/Sentence}}
</div>`,
  back: `{{FrontSide}}

<hr id=answer>

<div class="aozora">
{{#Furigana}}<div class="headword">{{Furigana}}</div>{{/Furigana}}
{{^Furigana}}<div class="headword">{{Word}}</div>{{/Furigana}}
{{#Pitch}}<div class="pitch">{{Pitch}}</div>{{/Pitch}}
{{#Part of speech}}<div class="pos">{{Part of speech}}</div>{{/Part of speech}}
{{#Frequency}}<div><span class="chip">{{Frequency}}</span></div>{{/Frequency}}
{{#Meaning}}<div class="meaning">{{Meaning}}</div>{{/Meaning}}
{{#Source}}<div class="source">{{Source}}</div>{{/Source}}
</div>`,
  css: CARD_CSS,
};

/** Kanji note type: the character alone on the front, readings and stats behind. */
export const KANJI_MODEL: AnkiModelSpec = {
  name: "Aozora Kanji",
  cardName: "Recognition",
  fields: ["Character", "Meaning", "Onyomi", "Kunyomi", "Strokes", "Frequency", "Sentence", "Source"],
  templates: {
    Character: "{character}",
    Meaning: "{glossary}",
    Onyomi: "{onyomi}",
    Kunyomi: "{kunyomi}",
    Strokes: "{stroke-count}",
    Frequency: "{frequencies}",
    Sentence: "{sentence-marked}",
    Source: "{document-title}",
  },
  front: `<div class="aozora">
<div class="kanji">{{Character}}</div>
</div>`,
  back: `{{FrontSide}}

<hr id=answer>

<div class="aozora">
{{#Meaning}}<div class="kanji-meaning">{{Meaning}}</div>{{/Meaning}}
<div class="readings">
{{#Onyomi}}<div><span class="label">On</span>{{Onyomi}}</div>{{/Onyomi}}
{{#Kunyomi}}<div><span class="label">Kun</span>{{Kunyomi}}</div>{{/Kunyomi}}
</div>
<div>
{{#Strokes}}<span class="chip">{{Strokes}} strokes</span>{{/Strokes}}
{{#Frequency}}<span class="chip">{{Frequency}}</span>{{/Frequency}}
</div>
{{#Sentence}}<div class="sentence">{{Sentence}}</div>{{/Sentence}}
{{#Source}}<div class="source">{{Source}}</div>{{/Source}}
</div>`,
  css: CARD_CSS,
};

/** One rule of a stylesheet: its prelude, and its body when it has a block. */
interface CssRule {
  prelude: string;
  body: string | null;
}

const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, " ").trim();

/** Index just past a quoted string starting at `start`. */
function endOfString(css: string, start: number): number {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === "\\") i++;
    else if (css[i] === quote) return i + 1;
  }
  return css.length;
}

/** Splits a stylesheet into its top-level rules, ignoring braces inside strings and comments. */
function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  let start = 0;
  let blockStart = 0;
  let depth = 0;

  while (i < css.length) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
    } else if (c === '"' || c === "'") {
      i = endOfString(css, i);
    } else if (c === "{") {
      if (depth === 0) blockStart = i;
      depth++;
      i++;
    } else if (c === "}") {
      i++;
      if (depth > 0 && --depth === 0) {
        rules.push({ prelude: stripComments(css.slice(start, blockStart)), body: css.slice(blockStart + 1, i - 1) });
        start = i;
      }
    } else if (c === ";" && depth === 0) {
      const prelude = stripComments(css.slice(start, i));
      if (prelude) rules.push({ prelude, body: null });
      i++;
      start = i;
    } else {
      i++;
    }
  }
  return rules;
}

/** Splits a selector list on its top-level commas. */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '"' || c === "'") i = endOfString(list, i) - 1;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// At-rules whose body is itself a list of rules, so scoping recurses into them.
const NESTED_AT_RULE = /^@(media|supports|layer|container|scope)\b/i;

/**
 * Rewrites a stylesheet so every rule only applies inside `prefix`. Used instead
 * of `@scope` (which the popup can use) because Anki's older WebEngine builds
 * don't support it. At-rules a card can't use (`@import`, `@font-face`,
 * `@keyframes`) are dropped; rules nested inside a selector are left alone,
 * since they already resolve against their scoped parent.
 */
export function scopeCss(css: string, prefix: string): string {
  const out: string[] = [];
  for (const rule of parseRules(css)) {
    if (rule.body === null) continue;
    if (rule.prelude.startsWith("@")) {
      if (NESTED_AT_RULE.test(rule.prelude)) out.push(`${rule.prelude} {\n${scopeCss(rule.body, prefix)}\n}`);
      continue;
    }
    // `:root` would never match under a prefix, so custom properties declared on
    // it are moved onto the scope itself.
    const selectors = splitSelectors(rule.prelude)
      .map((s) => (s === ":root" || s === "html" || s === "body" ? prefix : `${prefix} ${s}`))
      .join(", ");
    if (selectors) out.push(`${selectors} {${rule.body}}`);
  }
  return out.join("\n");
}

/**
 * The same note type with every imported dictionary's stylesheet appended,
 * scoped to the glosses that dictionary contributed. The card is built from the
 * dictionaries present when it's installed, so importing one later means
 * installing again.
 */
export function withDictionaryStyles(spec: AnkiModelSpec, styles: { dictId: string; css: string }[]): AnkiModelSpec {
  const scoped = styles
    .filter((s) => s.css.trim())
    .map((s) => scopeCss(s.css, `[${DICT_SCOPE_ATTR}="${s.dictId.replace(/["\\]/g, "\\$&")}"]`))
    .filter(Boolean);
  if (!scoped.length) return spec;
  return { ...spec, css: `${spec.css}\n${scoped.join("\n")}\n` };
}
