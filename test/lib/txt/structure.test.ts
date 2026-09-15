import { describe, it, expect } from "vitest";
import { splitAozoraText } from "@/lib/txt/structure";

const RULE = "-".repeat(55);

const FILE = [
  "ああ華族様だよ　と私は嘘を吐くのであった",
  "渡辺温",
  "",
  RULE,
  "【テキスト中に現れる記号について】",
  "",
  "《》：ルビ",
  "（例）酒場《バア》で",
  RULE,
  "",
  "　その晩、私は横浜へ出かけた。",
  "",
  "",
  "底本：「アンドロギュノスの裔」薔薇十字社",
  "入力：森下祐行",
].join("\n");

describe("splitAozoraText", () => {
  it("reads the title and author off the header", () => {
    const { title, author } = splitAozoraText(FILE);
    expect(title).toBe("ああ華族様だよ　と私は嘘を吐くのであった");
    expect(author).toBe("渡辺温");
  });

  it("keeps only the body, legend and colophon removed", () => {
    expect(splitAozoraText(FILE).lines).toEqual(["　その晩、私は横浜へ出かけた。"]);
  });

  it("still finds the body when the file carries no legend", () => {
    const { title, author, lines } = splitAozoraText(["題名", "著者", "", "　本文。"].join("\n"));
    expect([title, author]).toEqual(["題名", "著者"]);
    expect(lines).toEqual(["　本文。"]);
  });

  it("treats a rule of dashes deep in the prose as prose", () => {
    const { lines } = splitAozoraText(["題名", "著者", "", ...Array(45).fill("　行。"), RULE].join("\n"));
    expect(lines).toHaveLength(46);
  });
});
