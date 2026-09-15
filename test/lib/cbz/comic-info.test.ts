import { describe, it, expect } from "vitest";
import { parseComicInfo } from "@/lib/cbz/comic-info";

describe("parseComicInfo", () => {
  it("reads title, author, language and direction", () => {
    const info = parseComicInfo(`<?xml version="1.0"?>
      <ComicInfo>
        <Title>よつばと！</Title>
        <Writer>あずまきよひこ</Writer>
        <LanguageISO>ja</LanguageISO>
        <Manga>YesAndRightToLeft</Manga>
      </ComicInfo>`);
    expect(info).toEqual({ title: "よつばと！", author: "あずまきよひこ", language: "ja", rtl: true });
  });

  it("builds a title from series + number when Title is absent", () => {
    const info = parseComicInfo(`<ComicInfo><Series>ベルセルク</Series><Number>3</Number></ComicInfo>`);
    expect(info?.title).toBe("ベルセルク 3");
  });

  it("falls back to the penciller when there is no writer", () => {
    expect(parseComicInfo(`<ComicInfo><Penciller>P</Penciller></ComicInfo>`)?.author).toBe("P");
  });

  it("leaves direction unset unless the Manga field decides it", () => {
    expect(parseComicInfo(`<ComicInfo><Manga>Unknown</Manga></ComicInfo>`)?.rtl).toBeNull();
    expect(parseComicInfo(`<ComicInfo><Manga>No</Manga></ComicInfo>`)?.rtl).toBe(false);
  });

  it("returns null when there is nothing to read", () => {
    expect(parseComicInfo("<ComicInfo/>")).toBeNull();
    expect(parseComicInfo("<other/>")).toBeNull();
    expect(parseComicInfo("not xml at all")).toBeNull();
  });
});
