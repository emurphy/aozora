// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseBook } from "@/lib/epub/parse-book";
import { extractTxt } from "@/lib/txt/extract";

const RULE = "-".repeat(55);

const FILE = [
  "ああ華族様だよ",
  "渡辺温",
  "",
  RULE,
  "【テキスト中に現れる記号について】",
  "",
  "《》：ルビ",
  RULE,
  "",
  "第一章［＃「第一章」は大見出し］",
  "",
  "　そして、誰でも知っているインタアナショナル酒場《バア》でビールを飲んだ。",
  "　髪も眼も真黒で却々｜眉目秀麗《ハンサム》な男だった。",
  "　彼女は唇をそらそうと※［＃「足へん＋宛」、第3水準1-92-36］いた。",
  "［＃改ページ］",
  "第二章［＃「第二章」は大見出し］",
  "　底本：ではない、ただの行。",
].join("\n");

describe("extractTxt", () => {
  it("declares a tategaki spine of one item per chapter", () => {
    const { contents } = extractTxt(FILE, "aa.txt");
    expect(contents.package.spine["@_page-progression-direction"]).toBe("rtl");
    expect(contents.package.spine.itemref).toHaveLength(2);
  });

  it("lists every labelled chapter in the nav", () => {
    const nav = String(extractTxt(FILE, "aa.txt").result["nav.xhtml"]);
    expect(nav).toContain('<a href="c0001.xhtml">第一章</a>');
    expect(nav).toContain('<a href="c0002.xhtml">第二章</a>');
  });

  it("falls back to the file name when the header has no title", () => {
    const { contents } = extractTxt("　本文だけ。", "aa_kazokusama.txt");
    expect(contents.package.metadata["dc:title"]).toBe("aa_kazokusama");
  });

  it("refuses a file with no readable content", () => {
    expect(() => extractTxt("", "empty.txt")).toThrow();
  });
});

describe("parseBook on a text file", () => {
  it("reads the synthetic package like any other book", async () => {
    const book = await parseBook(new Blob([FILE]), "aa.txt");

    expect(book.vertical).toBe(true);
    expect(book.fixedLayout).toBe(false);
    // One section per chapter; the labels come from `a.innerText`, which jsdom
    // does not implement, so the nav text is asserted on the package instead.
    expect(book.sections.map((s) => s.reference)).toEqual(["aoz-c0001", "aoz-c0002"]);
    expect(book.elementHtml).toContain("<ruby>酒場<rt>バア</rt></ruby>");
    expect(book.elementHtml).toContain("踠いた");
  });

  it("counts the base text once and the reading not at all", async () => {
    const plain = await parseBook(new Blob(["　題\n\n" + "-".repeat(55) + "\n" + "-".repeat(55) + "\n　酒場でビールを飲んだ。"]), "a.txt");
    const rubied = await parseBook(new Blob(["　題\n\n" + "-".repeat(55) + "\n" + "-".repeat(55) + "\n　酒場《バア》でビールを飲んだ。"]), "b.txt");
    expect(rubied.characters).toBe(plain.characters);
  });
});
