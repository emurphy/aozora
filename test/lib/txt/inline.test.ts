import { describe, it, expect } from "vitest";
import { renderLine } from "@/lib/txt/inline";

describe("renderLine", () => {
  it("attaches the reading to the kanji run before it", () => {
    expect(renderLine("インタアナショナル酒場《バア》でビールを飲んだ").html).toBe(
      "インタアナショナル<ruby>酒場<rt>バア</rt></ruby>でビールを飲んだ",
    );
  });

  it("starts the base at ｜ instead of the whole run", () => {
    const { html, text } = renderLine("却々｜眉目秀麗《ハンサム》な男");
    expect(html).toBe("却々<ruby>眉目秀麗<rt>ハンサム</rt></ruby>な男");
    expect(text).toBe("却々眉目秀麗な男");
  });

  it("resolves a gaiji note to its JIS X 0213 character", () => {
    expect(renderLine("唇をそらそうと※［＃「足へん＋宛」、第3水準1-92-36］いた").html).toBe("唇をそらそうと踠いた");
  });

  it("falls back to the printer's mark when the note names no code", () => {
    expect(renderLine("※［＃「馬＋隹」］").html).toBe('<span class="aoz-txt-gaiji" title="馬＋隹">〓</span>');
  });

  it("drops a note about the source book", () => {
    expect(renderLine("と云った［＃「云った」は底本では「云つた」］、その言葉").html).toBe("と云った、その言葉");
  });

  it("marks up the text a 傍点 note points back at", () => {
    expect(renderLine("これは大事［＃「大事」に傍点］です").html).toBe('これは<em class="aoz-txt-sesame">大事</em>です');
  });

  it("finds that text through the ruby laid over it", () => {
    expect(renderLine("竪琴《ハープ》とで［＃「竪琴とで」に傍点］").html).toBe(
      '<em class="aoz-txt-sesame"><ruby>竪琴<rt>ハープ</rt></ruby>とで</em>',
    );
  });

  it("reports a heading note instead of styling it inline", () => {
    expect(renderLine("序章［＃「序章」は大見出し］").heading).toEqual({ level: 2, label: "序章" });
  });

  it("escapes text that would otherwise be markup", () => {
    expect(renderLine("a<b>&c").html).toBe("a&lt;b&gt;&amp;c");
  });

  it("leaves 《》 alone when nothing can carry the reading", () => {
    expect(renderLine("、《ほげ》").html).toBe("、《ほげ》");
  });
});
