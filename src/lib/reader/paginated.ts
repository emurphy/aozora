/**
 * Paginated (page-flip) reading controller on top of CSS multi-column layout.
 *
 * Exactly one spine section (`aoz-<idref>` wrapper) is rendered at a time into a
 * multi-column container, so each chapter starts on a fresh page:
 *   - vertical-rl (tategaki): `column-width = viewport height`, `width: 100%`,
 *     `height: auto`, paged via `scrollTop` (stride = viewport height + gap).
 *   - horizontal-tb: `column-width = viewport width`, fixed `height`, paged via
 *     `scrollLeft` (stride = width + gap); trailing partial page pulled in with
 *     `translateX`.
 *
 * Position is character-based, as in the continuous reader, so mode switches
 * preserve the place: per section, a `page → first character` map built from
 * each paragraph's leading edge.
 */

import { getParagraphNodes, getCharacterCount, countCharacters } from "@/lib/epub/dom-utils";

/** Inter-page gap, matching the reference reader. */
export const PAGE_GAP = 40;

export interface PaginatedState {
  char: number;
  /** Characters read through the end of this page. */
  charEnd: number;
  page: number;
  totalPages: number;
  sectionIndex: number;
}

export interface PaginatedOptions {
  /** The overflow-hidden viewport element. */
  scrollEl: HTMLElement;
  /** The multi-column container inside it. */
  contentEl: HTMLElement;
  /** Detached `aoz-<idref>` section elements. */
  sections: Element[];
  /** true for tategaki (vertical-rl). */
  vertical: boolean;
  /** Columns per page for horizontal mode; 0 = auto, ignored when vertical. */
  columns?: number;
  onChange?: (state: PaginatedState) => void;
}

export type Landing = "start" | "end" | { char: number };

function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}

/** Wait for layout to settle (two frames) after swapping section HTML. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * `page -> characters read through it`. A page that starts no paragraph of its
 * own holds nothing but the spill-over of the one before, so it ends where the
 * next page that does start one begins.
 */
export function pageEnds(firstChar: (number | undefined)[], sectionChars: number): number[] {
  const ends = new Array<number>(firstChar.length);
  let next = sectionChars;
  for (let p = firstChar.length - 1; p >= 0; p -= 1) {
    ends[p] = next;
    const start = firstChar[p];
    if (start !== undefined) next = start;
  }
  return ends;
}

/** Bounding rect for a paragraph node (text nodes are measured via a Range). */
function nodeRect(node: Node): DOMRect {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  return rect;
}

export class PaginatedController {
  scrollEl: HTMLElement;
  contentEl: HTMLElement;
  sections: Element[];
  vertical: boolean;
  /** Raw columns setting (0 = auto); resolved per layout in `_effectiveColumns`. */
  columns: number;
  onChange: (state: PaginatedState) => void;
  gap: number;

  sectionIndex: number;
  page: number;
  totalPages: number;
  translate: number;

  contentW: number;
  contentH: number;

  pageStartChar: number[];
  pageEndChar: number[];
  sectionAccChar: number[];
  charCount: number;

  destroyed: boolean;

  constructor({ scrollEl, contentEl, sections, vertical, columns, onChange }: PaginatedOptions) {
    this.scrollEl = scrollEl;
    this.contentEl = contentEl;
    this.sections = sections;
    this.vertical = vertical;
    this.columns = columns ?? 0;
    this.onChange = onChange || (() => {});
    this.gap = PAGE_GAP;

    this.sectionIndex = -1;
    this.page = 0;
    this.totalPages = 1;
    this.translate = 0;

    this.contentW = 0;
    this.contentH = 0;

    // Per-section paragraph stats (recomputed on each section render / reflow).
    this.pageStartChar = [0];
    this.pageEndChar = [0];

    // Counting is layout-independent, so it runs on the detached elements up front.
    this.sectionAccChar = [];
    let acc = 0;
    for (const sec of sections) {
      acc += countCharacters(sec);
      this.sectionAccChar.push(acc);
    }
    this.charCount = acc;

    this.destroyed = false;
  }

  get sectionStart(): number {
    return this.sectionAccChar[this.sectionIndex - 1] || 0;
  }

  get viewportSize(): number {
    return this.vertical ? this.contentH : this.contentW;
  }

  get screenSize(): number {
    return this.viewportSize + this.gap;
  }

  get scrollSizeProp(): "scrollHeight" | "scrollWidth" {
    return this.vertical ? "scrollHeight" : "scrollWidth";
  }

  /** The reader's current character offset (sums up to the current page start). */
  get exploredChar(): number {
    return this.sectionStart + (this.pageStartChar[this.page] || 0);
  }

  /** Characters read through the end of the page: progress reports this, so the
   *  last page of the last section is the whole book. */
  get exploredCharEnd(): number {
    return this.sectionStart + (this.pageEndChar[this.page] || 0);
  }

  /** Columns per page: tategaki is always one; horizontal honours the setting, or
   *  on auto follows the reference reader at ~1 column per 1000px. */
  _effectiveColumns(): number {
    if (this.vertical) return 1;
    if (this.columns > 0) return this.columns;
    return Math.max(1, Math.ceil(this.contentW / 1000));
  }

  /** Whether a section carries no flowable text (cover / full-page illustration). */
  _isImageSection(index: number): boolean {
    if (index < 0) return false;
    const start = this.sectionAccChar[index - 1] || 0;
    return this.sectionAccChar[index] - start === 0;
  }

  /** Sizes the column container against the (padding-excluded) viewport box. */
  _applyColumnSizes(): void {
    const cs = getComputedStyle(this.scrollEl);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    this.contentW = Math.max(0, this.scrollEl.clientWidth - padX);
    this.contentH = Math.max(0, this.scrollEl.clientHeight - padY);

    const el = this.contentEl;
    el.style.columnGap = `${this.gap}px`;
    el.style.columnFill = "auto";

    // An image-only section would otherwise sit flush against the block-start
    // edge; a viewport-filling flex box centres it in either direction.
    if (this._isImageSection(this.sectionIndex)) {
      this._clearTransform();
      el.style.columnWidth = "auto";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.width = "100%";
      el.style.height = `${this.contentH}px`;
      return;
    }

    // A previous image section may have left this element as a flex box.
    el.style.display = "";
    el.style.alignItems = "";
    el.style.justifyContent = "";
    if (this.vertical) {
      // The trick that makes vertical-rl multicol page correctly.
      el.style.columnWidth = `${this.contentH}px`;
      el.style.width = "100%";
      el.style.height = "auto";
    } else {
      // N columns to a viewport-wide page: N*colW + (N-1)*gap = contentW. The
      // stride stays viewport+gap, so the next page starts exactly one screen over.
      const cols = this._effectiveColumns();
      const colW = cols > 1 ? (this.contentW - (cols - 1) * this.gap) / cols : this.contentW;
      el.style.columnWidth = `${colW}px`;
      el.style.width = "auto";
      el.style.height = `${this.contentH}px`;
    }
  }

  _clearTransform(): void {
    if (this.translate) {
      this.contentEl.style.transform = "";
      this.translate = 0;
    }
  }

  _resetScroll(): void {
    this._clearTransform();
    this.scrollEl.scrollLeft = 0;
    this.scrollEl.scrollTop = 0;
  }

  /**
   * Measures the rendered section into the `page → first character` map. Scroll
   * resets to the origin first, so the offsets are absolute within the section.
   */
  _measure(): void {
    this._resetScroll();

    const contentRect = this.contentEl.getBoundingClientRect();
    const nodes = getParagraphNodes(this.contentEl);
    const screen = this.screenSize;
    const scrollSize = this.scrollEl[this.scrollSizeProp];
    this.totalPages = Math.max(1, Math.ceil(scrollSize / screen));

    const pageFirstChar = new Array<number | undefined>(this.totalPages);

    let acc = 0;
    let prevPos = 0; // a zero-size node (e.g. an empty wrapper) inherits the last edge
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const r = nodeRect(node);
      const size = this.vertical ? r.height : r.width;
      const pos = size <= 0 ? prevPos : this.vertical ? r.top - contentRect.top : r.left - contentRect.left;
      prevPos = pos;

      // floor, not round: a paragraph still begins on the page its leading edge
      // is on, and rounding forward would overshoot a search hit inside it.
      const pg = clamp(Math.floor(pos / screen), 0, this.totalPages - 1);
      if (pageFirstChar[pg] === undefined) pageFirstChar[pg] = acc;

      acc += getCharacterCount(node);
    }

    // A page with no paragraph starting on it (e.g. a long paragraph spilling
    // over) inherits the previous page's start, keeping the map non-decreasing.
    this.pageStartChar = new Array(this.totalPages);
    let carry = 0;
    for (let p = 0; p < this.totalPages; p += 1) {
      const start = pageFirstChar[p];
      if (start === undefined) {
        this.pageStartChar[p] = carry;
      } else {
        this.pageStartChar[p] = start;
        carry = start;
      }
    }
    if (this.pageStartChar.length === 0) this.pageStartChar = [0];

    this.pageEndChar = pageEnds(pageFirstChar, acc);
    if (this.pageEndChar.length === 0) this.pageEndChar = [0];
  }

  /** Last page whose first character is at or before `within` (section-local). */
  _pageForCharWithin(within: number): number {
    let best = 0;
    for (let p = 0; p < this.pageStartChar.length; p += 1) {
      if (this.pageStartChar[p] <= within) best = p;
      else break;
    }
    return best;
  }

  _scrollToPage(p: number): void {
    p = clamp(p, 0, this.totalPages - 1);
    this.page = p;

    const pos = p * this.screenSize;
    const scrollSize = this.scrollEl[this.scrollSizeProp];

    if (this.vertical) {
      this._clearTransform();
      this.scrollEl.scrollTop = Math.min(pos, Math.max(0, scrollSize - this.contentH));
    } else if (pos + this.contentW <= scrollSize) {
      this._clearTransform();
      this.scrollEl.scrollLeft = pos;
    } else {
      // Trailing partial page: scrollLeft can't reach it, so pull it in.
      this.scrollEl.scrollLeft = 0;
      this.contentEl.style.transform = `translateX(${-pos}px)`;
      this.translate = -pos;
    }

    this._emit();
  }

  _emit(): void {
    this.onChange({
      char: this.exploredChar,
      charEnd: this.exploredCharEnd,
      page: this.page,
      totalPages: this.totalPages,
      sectionIndex: this.sectionIndex,
    });
  }

  /** Renders a section and lands on a page. */
  async setSection(index: number, landing?: Landing): Promise<void> {
    index = clamp(index, 0, this.sections.length - 1);
    this.sectionIndex = index;
    // Hidden while swapping, or the page-0 paint shows before the landing page.
    // visibility, not display:none, which would void the geometry _measure needs.
    this.contentEl.style.visibility = "hidden";
    this.contentEl.innerHTML = this.sections[index].outerHTML;

    await nextFrame();
    if (this.destroyed) return;

    this._applyColumnSizes();
    this._measure();

    let page = 0;
    if (landing === "end") page = this.totalPages - 1;
    else if (landing && typeof landing === "object" && typeof landing.char === "number") {
      page = this._pageForCharWithin(landing.char - this.sectionStart);
    }
    this._scrollToPage(page);
    this.contentEl.style.visibility = "";
  }

  /** Advances (dir = 1) or rewinds (dir = -1) one page, crossing sections. */
  async flipPage(dir: number): Promise<void> {
    const next = this.page + dir;
    if (next < 0) {
      if (this.sectionIndex > 0) await this.setSection(this.sectionIndex - 1, "end");
      return;
    }
    if (next >= this.totalPages) {
      if (this.sectionIndex < this.sections.length - 1) {
        await this.setSection(this.sectionIndex + 1, "start");
      }
      return;
    }
    this._scrollToPage(next);
  }

  /** Restores the reader to a global character offset. */
  async restoreToChar(char: number): Promise<void> {
    // Straight to section 0: front illustrations are 0-char sections, which the
    // search below would skip past to the first section with text.
    if (char <= 0) {
      await this.setSection(0, "start");
      return;
    }
    let index = 0;
    while (index < this.sectionAccChar.length - 1 && this.sectionAccChar[index] <= char) {
      index += 1;
    }
    await this.setSection(index, { char });
  }

  /** Jumps to the section containing a TOC reference (its id or a descendant). */
  jumpToSectionId(id: string): boolean {
    const index = this.sections.findIndex((s) => s.id === id || s.querySelector(`[id="${CSS.escape(id)}"]`));
    if (index < 0) return false;
    this.setSection(index, "start");
    return true;
  }

  /** Re-paginates the current section after a resize or font/spacing change. */
  async refresh(): Promise<void> {
    if (this.sectionIndex < 0) return;
    const char = this.exploredChar;
    this._applyColumnSizes();
    await nextFrame();
    if (this.destroyed) return;
    this._measure();
    this._scrollToPage(this._pageForCharWithin(char - this.sectionStart));
  }

  destroy(): void {
    this.destroyed = true;
  }
}
