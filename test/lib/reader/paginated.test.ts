// @vitest-environment jsdom
//
// Only the layout-independent pieces: character accounting, the derived getters
// and the page<->character mapping. Rendering (setSection, _measure, flipPage)
// needs multi-column layout + scroll geometry, which jsdom does not compute.
import { describe, it, expect, vi } from "vitest";
import { PaginatedController, PAGE_GAP, pageEnds } from "@/lib/reader/paginated";

function section(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

function makeController({ vertical = false } = {}) {
  // counts: 3, 2, 4  ->  cumulative 3, 5, 9
  const sections = [section("<p>あいう</p>"), section("<p>えお</p>"), section("<p>かきくけ</p>")];
  return new PaginatedController({
    scrollEl: document.createElement("div"),
    contentEl: document.createElement("div"),
    sections,
    vertical,
    onChange: vi.fn(),
  });
}

describe("PaginatedController character accounting", () => {
  it("computes cumulative per-section character counts and the book total", () => {
    const c = makeController();
    expect(c.sectionAccChar).toEqual([3, 5, 9]);
    expect(c.charCount).toBe(9);
  });

  it("sectionStart is 0 before any section is rendered", () => {
    const c = makeController();
    expect(c.sectionStart).toBe(0); // sectionIndex === -1
  });

  it("sectionStart is the cumulative count up to the previous section", () => {
    const c = makeController();
    c.sectionIndex = 2;
    expect(c.sectionStart).toBe(5); // sections 0+1 => 3+2
  });

  it("exploredChar adds the current page's start to the section start", () => {
    const c = makeController();
    c.sectionIndex = 2; // sectionStart 5
    c.pageStartChar = [0, 5];
    c.page = 1;
    expect(c.exploredChar).toBe(10);
  });

  it("exploredCharEnd adds the current page's end to the section start", () => {
    const c = makeController();
    c.sectionIndex = 2; // sectionStart 5, section ends at 9
    c.pageEndChar = [2, 4];
    c.page = 0;
    expect(c.exploredCharEnd).toBe(7);
    c.page = 1;
    expect(c.exploredCharEnd).toBe(9); // last page of the last section: the whole book
  });
});

describe("pageEnds", () => {
  it("ends each page where the next one starts", () => {
    expect(pageEnds([0, 10, 25], 40)).toEqual([10, 25, 40]);
  });

  it("runs a spill-over page (no paragraph of its own) to the section end", () => {
    // Page 3 holds only the tail of the paragraph that began on page 2, so both
    // read through to the end: this is the short-book 55% plateau.
    expect(pageEnds([0, 10, 25, undefined], 40)).toEqual([10, 25, 40, 40]);
  });

  it("is empty for a section with no pages", () => {
    expect(pageEnds([], 0)).toEqual([]);
  });
});

describe("PaginatedController._isImageSection", () => {
  it("flags text-free sections (cover / full-page illustrations) only", () => {
    // counts: 3, 2, 4 -> an extra image-only section has 0 characters.
    const sections = [
      section('<div class="aoz-no-text"><img src="x"/></div>'), // 0 chars
      section("<p>あいう</p>"), // 3
      section("<p>えお</p>"), // 2
    ];
    const c = new PaginatedController({
      scrollEl: document.createElement("div"),
      contentEl: document.createElement("div"),
      sections,
      vertical: true,
      onChange: vi.fn(),
    });
    expect(c.sectionAccChar).toEqual([0, 3, 5]);
    expect(c._isImageSection(0)).toBe(true); // image-only
    expect(c._isImageSection(1)).toBe(false); // has text
    expect(c._isImageSection(2)).toBe(false);
    expect(c._isImageSection(-1)).toBe(false); // nothing rendered yet
  });
});

describe("PaginatedController._pageForCharWithin", () => {
  it("maps a section-local offset to the last page starting at or before it", () => {
    const c = makeController();
    c.pageStartChar = [0, 5, 12];
    expect(c._pageForCharWithin(0)).toBe(0);
    expect(c._pageForCharWithin(4)).toBe(0);
    expect(c._pageForCharWithin(5)).toBe(1);
    expect(c._pageForCharWithin(11)).toBe(1);
    expect(c._pageForCharWithin(12)).toBe(2);
    expect(c._pageForCharWithin(999)).toBe(2);
  });
});

describe("PaginatedController axis getters", () => {
  it("uses scrollWidth/scrollHeight per writing direction", () => {
    expect(makeController({ vertical: false }).scrollSizeProp).toBe("scrollWidth");
    expect(makeController({ vertical: true }).scrollSizeProp).toBe("scrollHeight");
  });

  it("screenSize is the viewport size plus the inter-page gap", () => {
    const c = makeController();
    c.contentW = 600;
    expect(c.gap).toBe(PAGE_GAP);
    expect(c.screenSize).toBe(640);
  });

  it("destroy() flips the destroyed flag", () => {
    const c = makeController();
    expect(c.destroyed).toBe(false);
    c.destroy();
    expect(c.destroyed).toBe(true);
  });
});
