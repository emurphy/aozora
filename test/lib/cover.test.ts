import { describe, it, expect } from "vitest";
import { coverPlaceholder } from "@/lib/cover";

describe("coverPlaceholder", () => {
  it("gives Aozora Bunko text files their own jacket", () => {
    expect(coverPlaceholder({ filePath: "C:/library/x/book.txt" })).toContain("aozora-bunko");
  });

  it("leaves every other format on the generic template", () => {
    expect(coverPlaceholder({ filePath: "C:/library/x/book.epub" })).toContain("book-template");
    expect(coverPlaceholder({ filePath: "C:/library/x/book.cbz" })).toContain("book-template");
  });
});
