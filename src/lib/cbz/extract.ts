import { BlobWriter, TextWriter, type Entry, type FileEntry } from "@zip.js/zip.js";
import type { ExtractedEpub } from "@/lib/epub/extract";
import type { BookMetadata } from "@/lib/epub/metadata";
import type { OpfContents } from "@/lib/epub/opf";
import { parseComicInfo, type ComicInfo } from "./comic-info";

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

// Pages are usually numbered without padding, so "2.jpg" must sort before "10.jpg".
const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function imageMime(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ext && IMAGE_MIME[ext]) || null;
}

/** Dotfiles and macOS resource forks (`__MACOSX/._page.jpg`) are not pages. Other
 *  cruft (Thumbs.db, readme.txt) is already excluded by the image-extension check. */
function isJunk(filename: string): boolean {
  return filename.split("/").some((seg) => seg === "__MACOSX" || seg.startsWith("."));
}

export interface ComicPage {
  /** Entry name inside the archive; only the ordering and the read use it. */
  name: string;
  /** Synthetic manifest href, also the blob key the flattened HTML carries. */
  href: string;
  mime: string;
  entry: FileEntry;
}

const pageId = (index: number) => `p${String(index + 1).padStart(4, "0")}`;

/**
 * The archive's pages in reading order: images only, sorted as a file manager
 * would. Each gets a synthetic href rather than its entry name: the name is
 * arbitrary user input and ends up inside an `src` attribute downstream, and
 * padded ids also keep the blob-key matching in format-html unambiguous.
 */
export function listComicPages(fileMap: Map<string, Entry>): ComicPage[] {
  const found: Omit<ComicPage, "href">[] = [];
  for (const [name, entry] of fileMap) {
    if (entry.directory || isJunk(name)) continue;
    const mime = imageMime(name);
    if (mime) found.push({ name, mime, entry });
  }
  return found
    .sort((a, b) => naturalOrder.compare(a.name, b.name))
    .map((page, i) => ({ ...page, href: `${pageId(i)}.${page.name.split(".").pop()!.toLowerCase()}` }));
}

async function readComicInfo(fileMap: Map<string, Entry>): Promise<ComicInfo | null> {
  for (const [filename, entry] of fileMap) {
    if (entry.directory || filename.split("/").pop()?.toLowerCase() !== "comicinfo.xml") continue;
    try {
      return parseComicInfo(await entry.getData(new TextWriter()));
    } catch {
      return null; // unreadable sidecar: the archive still reads fine without it
    }
  }
  return null;
}

/**
 * A synthetic OPF for a comic archive: every image becomes a manifest item and a
 * spine itemref, and the package declares itself pre-paginated. Downstream this
 * is indistinguishable from a bare-image OMF book, so generateHtml's
 * image-in-spine path and the fixed-layout viewer need no CBZ branch.
 *
 * No viewport is declared: CBZ pages carry no authored size and may vary between
 * pages, so the viewer measures each bitmap (fixed-layout-view's pageViewport).
 */
export function buildComicOpf(pages: ComicPage[], info: ComicInfo | null): OpfContents {
  return {
    package: {
      metadata: {
        "dc:title": info?.title ?? "",
        "dc:creator": info?.author ?? "",
        "dc:language": info?.language || "ja",
        meta: [{ "@_property": "rendition:layout", "#text": "pre-paginated" }],
      },
      manifest: {
        item: pages.map((page, i) => ({ "@_id": pageId(i), "@_href": page.href, "@_media-type": page.mime })),
      },
      spine: {
        // Manga (right to left) unless ComicInfo says otherwise: no CBZ declares
        // a progression direction, and this app targets Japanese books.
        "@_page-progression-direction": info?.rtl === false ? "ltr" : "rtl",
        itemref: pages.map((_, i) => ({ "@_idref": pageId(i) })),
      },
    },
  };
}

/** Unpacks a CBZ: every page image as a Blob, keyed by its synthetic href. */
export async function extractCbz(fileMap: Map<string, Entry>): Promise<ExtractedEpub> {
  const pages = listComicPages(fileMap);
  if (!pages.length) throw new Error("Invalid comic archive: no images");

  const info = await readComicInfo(fileMap);
  const result: Record<string, string | Blob> = {};
  await Promise.all(
    pages.map(async (page) => {
      result[page.href] = await page.entry.getData<Blob>(new BlobWriter(page.mime));
    }),
  );

  return { contents: buildComicOpf(pages, info), result };
}

/** Metadata for a CBZ: ComicInfo.xml when present, else the filename and the
 *  first page as cover. */
export async function extractCbzMetadata(fileMap: Map<string, Entry>, fileName: string): Promise<BookMetadata> {
  const info = await readComicInfo(fileMap);
  const cover = listComicPages(fileMap)[0];

  let coverBytes: ArrayBuffer | null = null;
  if (cover) {
    const blob = await cover.entry.getData<Blob>(new BlobWriter(cover.mime));
    coverBytes = await blob.arrayBuffer();
  }

  return {
    title: info?.title || fileName.replace(/\.[^.]+$/, ""),
    author: info?.author || "",
    language: info?.language || "ja",
    coverBytes,
    coverMime: cover?.mime ?? null,
  };
}
