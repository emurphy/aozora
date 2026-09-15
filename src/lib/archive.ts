import { BlobReader, ZipReader, configure, type Entry } from "@zip.js/zip.js";
import { extractEpub, type ExtractedEpub } from "./epub/extract";
import { extractEpubMetadata, type BookMetadata } from "./epub/metadata";
import { extractCbz, extractCbzMetadata } from "./cbz/extract";
import { decodeTextFile } from "./txt/decode";
import { extractTxt, extractTxtMetadata } from "./txt/extract";
import { bookFormat } from "./types";

// No web workers: simpler/more robust under the Electron renderer + Vite.
configure({ useWebWorkers: false });

/** Opens a book archive and maps its entries by filename; the caller closes it. */
async function openZip(blob: Blob): Promise<{ fileMap: Map<string, Entry>; close: () => Promise<void> }> {
  const reader = new ZipReader(new BlobReader(blob));
  try {
    const entries = await reader.getEntries();
    if (!entries.length) throw new Error("Invalid book: empty archive");
    return { fileMap: new Map(entries.map((e) => [e.filename, e])), close: () => reader.close() };
  } catch (err) {
    await reader.close(); // only on the failure paths: success hands the reader to the caller
    throw err;
  }
}

/** Unpacks a book into the shape the parser consumes. `fileName` decides how it
 *  is read (see bookFormat); text files are not archives, so they branch first. */
export async function extractArchive(blob: Blob, fileName: string): Promise<ExtractedEpub> {
  if (bookFormat(fileName) === "txt") return extractTxt(decodeTextFile(await blob.arrayBuffer()), fileName);

  const { fileMap, close } = await openZip(blob);
  try {
    return bookFormat(fileName) === "cbz" ? await extractCbz(fileMap) : await extractEpub(fileMap);
  } finally {
    await close();
  }
}

/** Display metadata + cover. `fileName` decides how the book is read, and is the
 *  title fallback for a CBZ with no ComicInfo.xml or a text file with no header. */
export async function extractArchiveMetadata(blob: Blob, fileName: string): Promise<BookMetadata> {
  if (bookFormat(fileName) === "txt") return extractTxtMetadata(decodeTextFile(await blob.arrayBuffer()), fileName);

  const { fileMap, close } = await openZip(blob);
  try {
    return bookFormat(fileName) === "cbz" ? await extractCbzMetadata(fileMap, fileName) : await extractEpubMetadata(fileMap);
  } finally {
    await close();
  }
}
