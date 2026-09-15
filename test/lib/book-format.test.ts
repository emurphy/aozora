import { describe, it, expect } from "vitest";
import { bookFormat, isBookFileName, storedBookName, isStoredBookName } from "@/lib/types";

describe("bookFormat", () => {
  it("reads .epub as an EPUB and the comic extensions as CBZ", () => {
    expect(bookFormat("novel.epub")).toBe("epub");
    expect(bookFormat("manga.cbz")).toBe("cbz");
    expect(bookFormat("scans.zip")).toBe("cbz");
  });

  it("ignores case and the rest of the path", () => {
    expect(bookFormat("C:/books/Vol 1.EPUB")).toBe("epub");
    expect(bookFormat("/library/x/book.CBZ")).toBe("cbz");
  });
});

describe("isBookFileName", () => {
  it("accepts the importable extensions only", () => {
    expect(["a.epub", "b.cbz", "c.zip"].every(isBookFileName)).toBe(true);
    expect(["a.pdf", "b.cbr", "notes.txt", "noextension"].some(isBookFileName)).toBe(false);
  });
});

describe("storedBookName", () => {
  it("names the stored original after its format", () => {
    expect(storedBookName("/src/novel.epub")).toBe("book.epub");
    expect(storedBookName("/src/manga.cbz")).toBe("book.cbz");
    expect(storedBookName("/src/scans.zip")).toBe("book.cbz");
  });

  it("round-trips through the stored-file check", () => {
    expect(isStoredBookName(storedBookName("x.epub"))).toBe(true);
    expect(isStoredBookName(storedBookName("x.zip"))).toBe(true);
    expect(isStoredBookName("cover.jpg")).toBe(false);
  });
});
