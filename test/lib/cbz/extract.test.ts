import { describe, it, expect } from "vitest";
import type { Entry } from "@zip.js/zip.js";
import { listComicPages, buildComicOpf } from "@/lib/cbz/extract";
import {
  getManifestItems,
  getSpineItemRefs,
  getPageProgressionDirection,
  getBookViewport,
  isFixedLayout,
} from "@/lib/epub/opf";

/** A file map shaped like the one zip.js hands back, keyed by entry name. */
function archive(...names: string[]): Map<string, Entry> {
  return new Map(names.map((name) => [name, { filename: name, directory: name.endsWith("/") } as Entry]));
}

const names = (fileMap: Map<string, Entry>) => listComicPages(fileMap).map((p) => p.name);

describe("listComicPages", () => {
  it("orders unpadded page numbers naturally", () => {
    expect(names(archive("10.jpg", "2.jpg", "1.jpg", "21.jpg"))).toEqual(["1.jpg", "2.jpg", "10.jpg", "21.jpg"]);
  });

  it("keeps images only and drops archive cruft", () => {
    const fileMap = archive("001.png", "__MACOSX/._001.png", ".DS_Store", "Thumbs.db", "ComicInfo.xml", "notes.txt", "pages/", "002.webp");
    expect(names(fileMap)).toEqual(["001.png", "002.webp"]);
  });

  it("walks nested chapter folders in order", () => {
    expect(names(archive("ch10/1.jpg", "ch2/2.jpg", "ch2/10.jpg", "ch2/1.jpg"))).toEqual(["ch2/1.jpg", "ch2/2.jpg", "ch2/10.jpg", "ch10/1.jpg"]);
  });

  it("reports each page's media type", () => {
    expect(listComicPages(archive("a.JPG", "b.png")).map((p) => p.mime)).toEqual(["image/jpeg", "image/png"]);
  });

  it("keys pages by a synthetic href, never by the archive's own filename", () => {
    const pages = listComicPages(archive(`ba"d name.jpg`, "second.PNG"));
    expect(pages.map((p) => p.href)).toEqual(["p0001.jpg", "p0002.png"]);
  });
});

describe("buildComicOpf", () => {
  const pages = listComicPages(archive("1.jpg", "2.jpg", "3.jpg"));

  it("declares a pre-paginated package with one spine item per image", () => {
    const opf = buildComicOpf(pages, null);
    expect(isFixedLayout(opf)).toBe(true);
    expect(getManifestItems(opf).map((i) => i["@_href"])).toEqual(["p0001.jpg", "p0002.jpg", "p0003.jpg"]);
    expect(getSpineItemRefs(opf).map((r) => r["@_idref"])).toEqual(["p0001", "p0002", "p0003"]);
  });

  it("every spine idref resolves to an image manifest item", () => {
    const opf = buildComicOpf(pages, null);
    const items = new Map(getManifestItems(opf).map((i) => [i["@_id"], i]));
    for (const ref of getSpineItemRefs(opf)) {
      expect(items.get(ref["@_idref"])?.["@_media-type"]).toBe("image/jpeg");
    }
  });

  it("reads right to left unless ComicInfo says otherwise", () => {
    const info = { title: "", author: "", language: "", rtl: null };
    expect(getPageProgressionDirection(buildComicOpf(pages, null))).toBe("rtl");
    expect(getPageProgressionDirection(buildComicOpf(pages, info))).toBe("rtl");
    expect(getPageProgressionDirection(buildComicOpf(pages, { ...info, rtl: false }))).toBe("ltr");
  });

  it("declares no viewport, so the viewer measures each page", () => {
    expect(getBookViewport(buildComicOpf(pages, null))).toBeNull();
  });
});
