import { describe, expect, it } from "vitest";
import { toCsv, toTsv } from "@/lib/vocab/export";
import type { VocabEntry } from "@/lib/types";

function entry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: "v1",
    expression: "食べる",
    reading: "たべる",
    state: "learning",
    lookupCount: 3,
    firstAt: new Date(2026, 2, 1, 9, 30).getTime(),
    lastAt: new Date(2026, 2, 5, 22, 0).getTime(),
    minedAt: null,
    lastBookId: "b1",
    lastBookTitle: "薬屋のひとりごと",
    lastSentence: "ご飯を食べさせられた。",
    ...overrides,
  };
}

describe("vocab export", () => {
  it("writes a header and local-calendar dates", () => {
    const [header, row] = toCsv([entry()]).split("\r\n");
    expect(header).toBe("Expression,Reading,State,Lookups,First seen,Last seen,Book,Sentence");
    expect(row).toBe("食べる,たべる,learning,3,2026-03-01,2026-03-05,薬屋のひとりごと,ご飯を食べさせられた。");
  });

  it("quotes CSV fields holding a comma, quote or newline", () => {
    const row = toCsv([entry({ lastSentence: 'He said "hi", then left.\nShe did not.' })]).split("\r\n")[1];
    expect(row.endsWith('"He said ""hi"", then left.\nShe did not."')).toBe(true);
  });

  it("flattens TSV cells, which have no quoting", () => {
    const row = toTsv([entry({ lastSentence: "one\ttwo\nthree" })]).split("\n")[1];
    expect(row.split("\t")).toHaveLength(8);
    expect(row.endsWith("one two three")).toBe(true);
  });

  it("leaves a word with no recorded book or sentence empty, not undefined", () => {
    const row = toCsv([entry({ lastBookTitle: null, lastSentence: null })]).split("\r\n")[1];
    expect(row.endsWith(",,")).toBe(true);
  });
});
