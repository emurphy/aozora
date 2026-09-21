import { ipcMain, dialog, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { libraryStore } from "./services/library-store.js";
import { resizeCover } from "./cover-image.js";
import { BOOK_EXTENSIONS, storedBookName, type Book, type PickedFile, type AddBookPayload, type AddBookResult, type UpdateBookPayload, type ProgressUpdate, type AddBookmarkPayload, type AddAnnotationPayload, type UpdateAnnotationPayload } from "@/lib/types";

const COVER_MAX_WIDTH = 300;
const COVER_JPEG_QUALITY = 90;

/** Downscales a cover for storage; null ⇒ keep the original bytes (see resizeCover). */
const downscaleCover = (buf: Buffer): Buffer | null => resizeCover(buf, COVER_MAX_WIDTH, COVER_JPEG_QUALITY);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * Paths outside the library the renderer may read: only what the user picked or
 * dropped. Otherwise `read-file` and `add-book` take any absolute path, so
 * anything that ran in the renderer could read the whole disk through them.
 */
const userChosenPaths = new Set<string>();

/**
 * Authorizes a path the user handed us (native picker, or a file macOS opened
 * with Aozora from Finder) and describes it for the renderer's import.
 */
export function allowUserFile(filePath: string): PickedFile {
  userChosenPaths.add(path.resolve(filePath));
  return { path: filePath, name: path.basename(filePath), size: fs.statSync(filePath).size };
}

function assertUserChosen(filePath: unknown): string {
  if (typeof filePath !== "string" || !userChosenPaths.has(path.resolve(filePath))) {
    throw new Error("refusing to read a path the user did not choose");
  }
  return filePath;
}

/**
 * Reads a cover file as a data URL so the renderer needs no custom protocol or
 * file:// access. Covers are stored pre-downscaled, so the URL stays small.
 *
 * Cached by path + mtime: `library:list` runs on every refresh and would
 * otherwise re-read + base64-encode every cover each time. A cheap stat detects
 * a rewritten cover (update-book bumps mtime) and refreshes the entry.
 */
const coverCache = new Map<string, { mtimeMs: number; dataUrl: string }>();

function readCoverDataUrl(coverPath: string | null): string | null {
  if (!coverPath) return null;
  try {
    const mtimeMs = fs.statSync(coverPath).mtimeMs;
    const cached = coverCache.get(coverPath);
    if (cached && cached.mtimeMs === mtimeMs) return cached.dataUrl;

    const ext = path.extname(coverPath).slice(1).toLowerCase();
    const mime = EXT_TO_MIME[ext] || "image/jpeg";
    const base64 = fs.readFileSync(coverPath).toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;
    coverCache.set(coverPath, { mtimeMs, dataUrl });
    return dataUrl;
  } catch {
    return null;
  }
}

/** Attaches a coverDataUrl to a book record for the renderer. */
function withCover(book: Book | null): Book | null {
  if (!book) return null;
  return { ...book, coverDataUrl: readCoverDataUrl(book.coverPath) };
}

const HASH_CHUNK = 1 << 20;

/** SHA-256 of a file, read in chunks: a fixed-layout book can be hundreds of MB. */
function hashFile(filePath: string): string {
  const hash = createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(HASH_CHUNK);
    let read: number;
    while ((read = fs.readSync(fd, buf, 0, HASH_CHUNK, null)) > 0) hash.update(buf.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

/**
 * The book this file was already imported as, or null. Identity is the bytes:
 * matching on title/author would refuse volumes that share a series title. Size
 * narrows the candidates first, so a library of hundreds isn't re-hashed per
 * import, and pre-hash rows are backfilled as they come up as candidates.
 */
function findDuplicate(contentHash: string, fileSize: number): Book | null {
  for (const candidate of libraryStore.booksByFileSize(fileSize)) {
    let known = candidate.contentHash;
    if (!known) {
      if (!fs.existsSync(candidate.filePath)) continue;
      known = hashFile(candidate.filePath);
      libraryStore.setContentHash(candidate.id, known);
    }
    if (known === contentHash) return libraryStore.getBook(candidate.id);
  }
  return null;
}

export const registerLibraryIpc = (): void => {
  ipcMain.handle("library:pick-files", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: "Import books",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Books", extensions: BOOK_EXTENSIONS },
        { name: "EPUB", extensions: ["epub"] },
        { name: "Comic archive", extensions: ["cbz", "zip"] },
        { name: "Aozora Bunko text", extensions: ["txt"] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths.map(allowUserFile);
  });

  // Dropped files: the preload resolves the path renderer-side and reports it
  // here. Synchronous so it lands before the read that follows.
  ipcMain.on("library:allow-path", (event, filePath: unknown) => {
    if (typeof filePath === "string" && filePath) userChosenPaths.add(path.resolve(filePath));
    event.returnValue = true;
  });

  // Raw bytes of a user-chosen path; renderer reads metadata before add-book.
  ipcMain.handle("library:read-file", (_event, filePath: string) => {
    return fs.promises.readFile(assertUserChosen(filePath));
  });

  // Copies the original book file into the managed library, persists metadata +
  // cover. An identical file already in the library is reported back, not copied.
  ipcMain.handle("library:add-book", (_event, payload: AddBookPayload): AddBookResult => {
    const { sourcePath, title, author, language, coverBytes, coverMime, fileSize } = payload;
    assertUserChosen(sourcePath); // copying is a read too

    const size = fileSize ?? fs.statSync(sourcePath).size;
    const contentHash = hashFile(sourcePath);
    const existing = findDuplicate(contentHash, size);
    if (existing) return { book: withCover(existing), duplicate: true };

    const id = randomUUID();
    const dir = path.join(libraryStore.getBooksDir(), id);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, storedBookName(sourcePath));
    fs.copyFileSync(sourcePath, filePath);

    let coverPath: string | null = null;
    if (coverBytes) {
      const original = Buffer.from(coverBytes);
      const thumb = downscaleCover(original);
      const ext = thumb ? "jpg" : MIME_TO_EXT[coverMime!] || "jpg";
      coverPath = path.join(dir, `cover.${ext}`);
      fs.writeFileSync(coverPath, thumb || original);
    }

    const book = libraryStore.insertBook({
      id,
      title: title || path.basename(sourcePath, path.extname(sourcePath)),
      author: author || null,
      language: language || null,
      filePath,
      coverPath,
      fileSize: size,
      addedAt: Date.now(),
      contentHash,
    });
    return { book: withCover(book), duplicate: false };
  });

  ipcMain.handle("library:list", () => libraryStore.listBooks().map(withCover));

  // A new cover is downscaled and written the same way as at import.
  ipcMain.handle("library:update-book", (_event, payload: UpdateBookPayload) => {
    const { id, title, author, coverBytes, coverMime } = payload;
    const existing = libraryStore.getBook(id);
    if (!existing) throw new Error(`book ${id} not found`);

    const fields: { title?: string; author?: string | null; coverPath?: string } = {};
    if (title !== undefined) fields.title = title?.trim() || existing.title;
    if (author !== undefined) fields.author = author?.trim() || null;

    if (coverBytes) {
      const dir = path.dirname(existing.filePath);
      const original = Buffer.from(coverBytes);
      const thumb = downscaleCover(original);
      const ext = thumb ? "jpg" : MIME_TO_EXT[coverMime!] || "jpg";
      // Drop the previous cover file first in case the extension changes.
      if (existing.coverPath && fs.existsSync(existing.coverPath)) {
        try {
          fs.rmSync(existing.coverPath);
        } catch {
          /* ignore */
        }
      }
      const coverPath = path.join(dir, `cover.${ext}`);
      fs.writeFileSync(coverPath, thumb || original);
      fields.coverPath = coverPath;
    }

    return withCover(libraryStore.updateBook(id, fields));
  });

  ipcMain.handle("library:remove", (_event, id: string) => {
    const book = libraryStore.getBook(id);
    if (book) {
      const dir = path.dirname(book.filePath);
      fs.rmSync(dir, { recursive: true, force: true });
      libraryStore.removeBook(id);
    }
    return true;
  });

  // Raw bytes of an imported book; the reader parses its content.
  ipcMain.handle("library:read-book", (_event, id: string) => {
    const book = libraryStore.getBook(id);
    if (!book) throw new Error(`book ${id} not found`);
    return fs.promises.readFile(book.filePath);
  });

  // Returns the bare book (no cover data URL): these fire on scroll / page-flip
  // (save-progress) and on a toggle (set-favorite), and the renderer discards the
  // result, so re-reading + base64-encoding the cover here would be wasted I/O.
  ipcMain.handle("library:save-progress", (_event, id: string, progress: ProgressUpdate) => libraryStore.updateProgress(id, progress));

  ipcMain.handle("library:set-favorite", (_event, id: string, favorite: boolean) => libraryStore.setFavorite(id, favorite));

  // --- Collections ---
  ipcMain.handle("library:list-collections", () => libraryStore.listCollections());

  ipcMain.handle("library:create-collection", (_event, name: string) =>
    libraryStore.createCollection({ id: randomUUID(), name: name.trim() || "Untitled collection", createdAt: Date.now() }),
  );

  ipcMain.handle("library:rename-collection", (_event, id: string, name: string) => libraryStore.renameCollection(id, name.trim() || "Untitled collection"));

  ipcMain.handle("library:remove-collection", (_event, id: string) => {
    libraryStore.removeCollection(id);
    return true;
  });

  ipcMain.handle("library:add-books-to-collection", (_event, id: string, bookIds: string[]) => libraryStore.addBooksToCollection(id, bookIds, Date.now()));

  ipcMain.handle("library:remove-book-from-collection", (_event, id: string, bookId: string) => libraryStore.removeBookFromCollection(id, bookId));

  ipcMain.handle("library:set-collection-books", (_event, id: string, bookIds: string[]) => libraryStore.setCollectionBooks(id, bookIds, Date.now()));

  ipcMain.handle("library:set-book-collections", (_event, bookId: string, collectionIds: string[]) =>
    libraryStore.setBookCollections(bookId, collectionIds, Date.now()),
  );

  // --- Bookmarks ---
  ipcMain.handle("library:list-bookmarks", (_event, bookId: string) => libraryStore.listBookmarks(bookId));

  ipcMain.handle("library:add-bookmark", (_event, payload: AddBookmarkPayload) => {
    const { bookId, charOffset, progress, snippet } = payload;
    return libraryStore.addBookmark({
      id: randomUUID(),
      bookId,
      charOffset,
      progress,
      snippet,
      createdAt: Date.now(),
    });
  });

  ipcMain.handle("library:remove-bookmark", (_event, id: string) => {
    libraryStore.removeBookmark(id);
    return true;
  });

  // --- Annotations (highlights + notes) ---
  ipcMain.handle("library:list-annotations", (_event, bookId: string) => libraryStore.listAnnotations(bookId));

  ipcMain.handle("library:add-annotation", (_event, payload: AddAnnotationPayload) => {
    const { bookId, startChar, endChar, color, note, snippet, progress } = payload;
    return libraryStore.addAnnotation({
      id: randomUUID(),
      bookId,
      startChar,
      endChar,
      color,
      note,
      snippet,
      progress,
      createdAt: Date.now(),
    });
  });

  ipcMain.handle("library:update-annotation", (_event, payload: UpdateAnnotationPayload) => {
    const { id, color, note } = payload;
    return libraryStore.updateAnnotation(id, { color, note });
  });

  ipcMain.handle("library:remove-annotation", (_event, id: string) => {
    libraryStore.removeAnnotation(id);
    return true;
  });
};
