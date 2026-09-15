import { describe, it, expect } from "vitest";
import { splitOnTerm } from "@/lib/vocab/mark";

const marked = (sentence: string, terms: (string | null)[]) => splitOnTerm(sentence, terms).find((p) => p.hit)?.text;

describe("splitOnTerm", () => {
  it("marks the term inside the sentence", () => {
    expect(splitOnTerm("彼は本を読んだ。", ["本"])).toEqual([
      { text: "彼は", hit: false },
      { text: "本", hit: true },
      { text: "を読んだ。", hit: false },
    ]);
  });

  it("marks every occurrence", () => {
    expect(splitOnTerm("本と本", ["本"]).filter((p) => p.hit)).toHaveLength(2);
  });

  it("prefers the first term that occurs, so the surface wins over the dictionary form", () => {
    expect(marked("ご飯を食べさせられた。", ["食べさせられた", "食べる"])).toBe("食べさせられた");
  });

  it("falls back to the next term when the first is absent", () => {
    expect(marked("きれいな空。", [null, "きれい"])).toBe("きれい");
  });

  it("falls back to the stem when only an inflected form is in the sentence", () => {
    expect(marked("涙が溢れた。", [null, "溢れる", "あふれる"])).toBe("溢れ");
  });

  it("prefers the longest stem that occurs", () => {
    // A surface stored with its furigana mixed in still yields the right stem.
    expect(marked("涙が溢れた。", ["溢あふれた", "溢れる"])).toBe("溢れ");
  });

  it("keeps a one-character kanji stem but not a one-character kana stem", () => {
    expect(marked("彼を見た。", ["見る"])).toBe("見");
    expect(marked("すぐに行く。", ["する"])).toBeUndefined();
  });

  it("returns the sentence untouched when nothing matches", () => {
    expect(splitOnTerm("何もない。", ["空"])).toEqual([{ text: "何もない。", hit: false }]);
  });

  it("drops the empty parts around a term at either edge", () => {
    expect(splitOnTerm("本を読む", ["本"])[0]).toEqual({ text: "本", hit: true });
  });
});
