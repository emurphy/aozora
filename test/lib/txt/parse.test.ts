import { describe, it, expect } from "vitest";
import { parseAozoraBody } from "@/lib/txt/parse";

describe("parseAozoraBody", () => {
  it("makes one paragraph per line", () => {
    const [chapter] = parseAozoraBody(["　一行目。", "　二行目。"]);
    expect(chapter.xhtml).toContain("<p>　一行目。</p><p>　二行目。</p>");
    expect(chapter.href).toBe("c0001.xhtml");
  });

  it("keeps a blank line as authored spacing", () => {
    const [chapter] = parseAozoraBody(["　本文。", "", "　続き。"]);
    expect(chapter.xhtml).toContain('<p>　本文。</p><p class="aoz-txt-blank"><br /></p><p>　続き。</p>');
  });

  it("starts a chapter at a heading and labels it", () => {
    const chapters = parseAozoraBody(["　前書き。", "第一章［＃「第一章」は大見出し］", "　本文。"]);
    expect(chapters.map((c) => c.label)).toEqual([null, "第一章"]);
    expect(chapters[1].xhtml).toContain("<h2>第一章</h2>");
  });

  it("takes the heading level from the note", () => {
    const chapters = parseAozoraBody(["一［＃「一」は中見出し］", "二［＃「二」は小見出し］"]);
    expect(chapters.map((c) => c.xhtml.includes("<h3>一</h3>") || c.xhtml.includes("<h4>二</h4>"))).toEqual([true, true]);
  });

  it("splits at a page break without labelling the new chapter", () => {
    const chapters = parseAozoraBody(["　前。", "［＃改ページ］", "　後。"]);
    expect(chapters).toHaveLength(2);
    expect(chapters[1].label).toBeNull();
    expect(chapters[1].xhtml).toContain("<p>　後。</p>");
  });

  it("indents the lines a 字下げ block covers, and only those", () => {
    const [chapter] = parseAozoraBody(["［＃ここから2字下げ］", "　引用。", "［＃ここで字下げ終わり］", "　地の文。"]);
    expect(chapter.xhtml).toContain('<p style="padding-inline-start:2em">　引用。</p>');
    expect(chapter.xhtml).toContain("<p>　地の文。</p>");
  });

  it("indents a single line from its own note", () => {
    const [chapter] = parseAozoraBody(["［＃３字下げ］　署名"]);
    expect(chapter.xhtml).toContain('<p style="padding-inline-start:3em">　署名</p>');
  });

  it("carries a heading block across the lines it wraps", () => {
    const chapters = parseAozoraBody(["［＃ここから大見出し］", "長い題", "［＃ここで大見出し終わり］", "　本文。"]);
    expect(chapters[0].label).toBe("長い題");
    expect(chapters[0].xhtml).toContain("<h2>長い題</h2>");
  });
});
