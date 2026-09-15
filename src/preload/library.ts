import { ipcRenderer, webUtils } from "electron";
import type { AddBookPayload, UpdateBookPayload, ProgressUpdate, AddBookmarkPayload, AddAnnotationPayload, UpdateAnnotationPayload } from "@/lib/types";

/**
 * Library API exposed to the renderer as `window.electronAPI.library`.
 * The main process owns book metadata + reading progress (source of truth);
 * the renderer mirrors it via these calls.
 */
export const libraryApi = {
  /** Opens the native picker. Resolves to [{ path, name, size }]. */
  pickFiles: () => ipcRenderer.invoke("library:pick-files"),

  /**
   * Resolves the absolute path of a dropped File. Electron 32+ removed
   * `File.path`; webUtils.getPathForFile is the supported replacement and must
   * run in the preload where the real File object is available.
   *
   * Also authorizes the path with main, which reads only what the user chose. A
   * forged File resolves to "", so this can't authorize an arbitrary path. Sync,
   * so it lands before the read rather than relying on send/invoke ordering.
   */
  getPathForFile: (file: File) => {
    const filePath = webUtils.getPathForFile(file);
    if (filePath) ipcRenderer.sendSync("library:allow-path", filePath);
    return filePath;
  },

  /** Raw bytes (Uint8Array) of a file path, for metadata extraction. */
  readFile: (filePath: string) => ipcRenderer.invoke("library:read-file", filePath),

  /**
   * Copies a book file into the library and persists metadata + cover. A file whose
   * bytes are already in the library imports nothing and comes back with
   * `duplicate: true` plus the existing record.
   */
  addBook: (payload: AddBookPayload) => ipcRenderer.invoke("library:add-book", payload),

  /** All books, newest first, each with a coverDataUrl. */
  list: () => ipcRenderer.invoke("library:list"),

  updateBook: (payload: UpdateBookPayload) => ipcRenderer.invoke("library:update-book", payload),

  /** Removes a book and its files. */
  remove: (id: string) => ipcRenderer.invoke("library:remove", id),

  /** Raw bytes (Uint8Array) of an imported book, for the reader. */
  readBook: (id: string) => ipcRenderer.invoke("library:read-book", id),

  saveProgress: (id: string, progress: ProgressUpdate) => ipcRenderer.invoke("library:save-progress", id, progress),

  /** Returns the updated record. */
  setFavorite: (id: string, favorite: boolean) => ipcRenderer.invoke("library:set-favorite", id, favorite),

  /** Every user-made collection with its member book ids. */
  listCollections: () => ipcRenderer.invoke("library:list-collections"),

  createCollection: (name: string) => ipcRenderer.invoke("library:create-collection", name),

  renameCollection: (id: string, name: string) => ipcRenderer.invoke("library:rename-collection", id, name),

  /** Drops the collection; the books themselves are untouched. */
  removeCollection: (id: string) => ipcRenderer.invoke("library:remove-collection", id),

  addBooksToCollection: (id: string, bookIds: string[]) => ipcRenderer.invoke("library:add-books-to-collection", id, bookIds),

  removeBookFromCollection: (id: string, bookId: string) => ipcRenderer.invoke("library:remove-book-from-collection", id, bookId),

  /** Makes a collection hold exactly `bookIds` (the bulk book picker). */
  setCollectionBooks: (id: string, bookIds: string[]) => ipcRenderer.invoke("library:set-collection-books", id, bookIds),

  /** Makes one book's memberships exactly `collectionIds`; returns the whole list. */
  setBookCollections: (bookId: string, collectionIds: string[]) => ipcRenderer.invoke("library:set-book-collections", bookId, collectionIds),

  /** All bookmarks for a book, ordered by reading position. */
  listBookmarks: (bookId: string) => ipcRenderer.invoke("library:list-bookmarks", bookId),

  addBookmark: (payload: AddBookmarkPayload) => ipcRenderer.invoke("library:add-bookmark", payload),

  removeBookmark: (id: string) => ipcRenderer.invoke("library:remove-bookmark", id),

  /** All highlights/annotations for a book, ordered by reading position. */
  listAnnotations: (bookId: string) => ipcRenderer.invoke("library:list-annotations", bookId),

  /** Adds a highlight (optionally with a note) over a character span. */
  addAnnotation: (payload: AddAnnotationPayload) => ipcRenderer.invoke("library:add-annotation", payload),

  updateAnnotation: (payload: UpdateAnnotationPayload) => ipcRenderer.invoke("library:update-annotation", payload),

  removeAnnotation: (id: string) => ipcRenderer.invoke("library:remove-annotation", id),
};
