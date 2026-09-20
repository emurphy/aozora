import { describe, it, expect } from "vitest";
import { KANJI_MODEL, TERM_MODEL, scopeCss, withDictionaryStyles } from "@/lib/dictionary/anki-model";
import { FIELD_MARKERS, KANJI_FIELD_MARKERS } from "@/lib/dictionary/anki-note";

/**
 * The shipped note types are only useful if their field mapping matches the
 * fields they create and the markers that exist; a typo in either would install
 * a note type that silently mines blank fields.
 */
describe.each([
  ["term", TERM_MODEL, FIELD_MARKERS],
  ["kanji", KANJI_MODEL, KANJI_FIELD_MARKERS],
])("%s note type", (_name, model, markers) => {
  it("maps exactly the fields it creates", () => {
    expect(Object.keys(model.templates).sort()).toEqual([...model.fields].sort());
  });

  it("only uses markers that exist", () => {
    for (const template of Object.values(model.templates)) {
      for (const [, marker] of template.matchAll(/\{([\w-]+)\}/g)) expect(markers).toContain(marker);
    }
  });

  it("references only real fields in its card templates", () => {
    const fields = new Set(model.fields);
    for (const html of [model.front, model.back]) {
      for (const [, name] of html.matchAll(/\{\{[#^/]?([^}]+)\}\}/g)) {
        if (name === "FrontSide") continue;
        expect(fields).toContain(name);
      }
    }
  });
});

describe("scopeCss", () => {
  const P = '[data-aoz-dict="d1"]';

  it("prefixes every selector in a list", () => {
    expect(scopeCss("a, b > i { color: red }", P)).toBe(`${P} a, ${P} b > i { color: red }`);
  });

  it("keeps commas inside :is() and attribute values intact", () => {
    expect(scopeCss(':is(a, b) [x="y,z"] { color: red }', P)).toBe(`${P} :is(a, b) [x="y,z"] { color: red }`);
  });

  it("recurses into media queries and drops what a card can't use", () => {
    expect(scopeCss("@media (min-width: 5px) { a { color: red } }", P)).toContain(`${P} a {`);
    expect(scopeCss('@import url("x.css"); @font-face { src: url(a) } a { color: red }', P)).toBe(`${P} a { color: red }`);
  });

  it("moves :root declarations onto the scope itself", () => {
    expect(scopeCss(":root { --x: red }", P)).toBe(`${P} { --x: red }`);
  });

  it("leaves rules nested inside a selector to resolve against their parent", () => {
    expect(scopeCss("a { color: red; span { margin: 1px } }", P)).toBe(`${P} a { color: red; span { margin: 1px } }`);
  });

  it("ignores braces inside strings and comments", () => {
    expect(scopeCss('a { content: "}" } /* b { } */ c { color: red }', P)).toBe(`${P} a { content: "}" }\n${P} c { color: red }`);
  });
});

describe("withDictionaryStyles", () => {
  it("appends each dictionary's stylesheet scoped to its own glosses", () => {
    const spec = withDictionaryStyles(TERM_MODEL, [
      { dictId: "jitendex", css: "span { color: red }" },
      { dictId: "empty", css: "  " },
    ]);
    expect(spec.css).toContain(TERM_MODEL.css);
    expect(spec.css).toContain('[data-aoz-dict="jitendex"] span { color: red }');
    expect(spec.css).not.toContain("empty");
  });

  it("returns the spec untouched when no dictionary carries styles", () => {
    expect(withDictionaryStyles(TERM_MODEL, [])).toBe(TERM_MODEL);
  });
});
