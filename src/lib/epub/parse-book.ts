import { extractArchive } from "@/lib/archive";
import { generateHtml, PREPEND, type Section } from "./generate-html";
import { generateStyleSheet } from "./generate-stylesheet";
import { getBookViewport, getPageProgressionDirection, getRenditionLayout, getRenditionSpread, getSpinePageSpreads, isFixedLayout, type PageSpread, type RenditionSpread } from "./opf";
import { buildSpreads } from "@/lib/reader/spreads";

export interface FixedLayoutPage {
  idref: string;
  wrapperId: string;
  pageSpread: PageSpread | null;
  ordinal: number;
}

export interface ParsedBook {
  elementHtml: string;
  styleSheet: string;
  blobs: Record<string, Blob>;
  sections: Section[];
  characters: number;
  vertical: boolean;
  fixedLayout: boolean;
  ppd: string;
  pages: FixedLayoutPage[] | null;
  bookViewport: { width: number; height: number } | null;
  spreadPairs: string[][] | null;
  renditionSpread: RenditionSpread;
}

/**
 * Parses a book blob into the reader payload: flattened HTML, combined
 * stylesheet, image blobs (keyed by path), chapter sections, char count. This is
 * the expensive step; results are cached in IndexedDB by the caller.
 *
 * Fixed-layout books (manga/comics) produce the same flattened HTML plus extra
 * fields describing how to render the wrappers as spreads: page order +
 * `page-spread` sides (`pages`), progression direction (`ppd`), and base viewport.
 *
 * `fileName` selects the format by extension. A CBZ enters here as a synthetic
 * pre-paginated package (see lib/cbz), so everything below is format-blind.
 */
export async function parseBook(blob: Blob, fileName: string): Promise<ParsedBook> {
  const { contents, result } = await extractArchive(blob, fileName);
  const { element, characters, sections } = generateHtml(result, contents);
  const styleSheet = generateStyleSheet(result, contents);

  const blobs: Record<string, Blob> = {};
  for (const [key, value] of Object.entries(result)) {
    if (value instanceof Blob) blobs[key] = value;
  }

  const elementHtml = element.innerHTML;
  const ppd = getPageProgressionDirection(contents);
  // Vertical (tategaki) detection. PPD=rtl and the 電書協 `vrtl` class are strong
  // signals. Calibre/KFX conversions instead declare `writing-mode: vertical-rl`
  // on arbitrary paragraph classes (no `vrtl`, sometimes no PPD), so also consult
  // the book stylesheet, but only when PPD isn't an explicit `ltr`, so a
  // horizontal book with a stray vertical caption isn't flipped wholesale.
  const cssDeclaresVertical = /(?:-webkit-|-epub-)?writing-mode\s*:\s*(?:vertical-[rl]l|tb-[rl]l)/i.test(styleSheet);
  const vertical = ppd === "rtl" || /\bvrtl\b/.test(elementHtml) || (ppd !== "ltr" && cssDeclaresVertical);

  const fixedLayout = isFixedLayout(contents);
  const renditionSpread = getRenditionSpread(contents);
  const effectivePpd = ppd || (fixedLayout ? "rtl" : "ltr");
  const spine = getSpinePageSpreads(contents).filter((p) => p.linear);

  let pages: FixedLayoutPage[] | null = null;
  let bookViewport: { width: number; height: number } | null = null;
  let spreadPairs: string[][] | null = null;
  if (fixedLayout) {
    // Wholly fixed-layout (manga) → dedicated FixedLayoutView renders it.
    bookViewport = getBookViewport(contents);
    let ordinal = 0;
    pages = spine.map((p) => ({
      idref: p.idref,
      wrapperId: `${PREPEND}${p.idref}`,
      pageSpread: p.pageSpread,
      ordinal: ordinal++,
    }));
  } else {
    // Reflowable book that may embed fixed-layout image pages (light novel with
    // manga-style colour spreads). Pre-compute which spine wrappers pair into a
    // two-page spread; reflowable text pages never pair.
    const packageLayout = getRenditionLayout(contents);
    const flow = spine.map((p) => ({
      idref: p.idref,
      pageSpread: p.pageSpread,
      prePaginated: (p.layout || packageLayout) === "pre-paginated",
    }));
    if (flow.some((p) => p.prePaginated)) {
      spreadPairs = buildSpreads(flow, effectivePpd as "rtl" | "ltr")
        .filter((s) => s.items.length === 2)
        .map((s) => s.items.map((it) => `${PREPEND}${it.idref}`));
      if (!spreadPairs.length) spreadPairs = null;
    }
  }

  return {
    elementHtml,
    styleSheet,
    blobs,
    sections,
    characters,
    vertical,
    fixedLayout,
    ppd: effectivePpd,
    pages,
    bookViewport,
    spreadPairs,
    renditionSpread,
  };
}
