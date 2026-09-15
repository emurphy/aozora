import { describe, it, expect } from "vitest";
import { charClass, rubyBaseStart } from "@/lib/txt/ruby";

/** The base the reading attaches to, for a line ending just before its `《`. */
function base(text: string): string {
  const chars = Array.from(text);
  return chars.slice(rubyBaseStart(chars, chars.length)).join("");
}

describe("charClass", () => {
  it("reads the iteration and counter marks as kanji", () => {
    expect(["々", "〆", "ヶ", "ヵ"].map(charClass)).toEqual(["kanji", "kanji", "kanji", "kanji"]);
  });

  it("separates the kana scripts and latin", () => {
    expect([charClass("か"), charClass("カ"), charClass("A"), charClass("Ａ"), charClass("、")]).toEqual([
      "hiragana",
      "katakana",
      "latin",
      "latin",
      "other",
    ]);
  });
});

describe("rubyBaseStart", () => {
  it("takes the kanji run before the reading", () => {
    expect(base("そして、誰でも知っているインタアナショナル酒場")).toBe("酒場");
  });

  it("stops at a change of script", () => {
    expect(base("私達の卓子")).toBe("卓子");
    expect(base("あれはカタカナ")).toBe("カタカナ");
  });

  it("swallows a whole kanji run, which is what ｜ exists to prevent", () => {
    expect(base("却々眉目秀麗")).toBe("却々眉目秀麗");
  });

  it("gives up when the preceding character can carry no reading", () => {
    expect(base("行末は、")).toBe("");
    expect(base("")).toBe("");
  });
});
