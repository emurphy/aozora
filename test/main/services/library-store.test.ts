// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Point the store's userData at a throwaway temp dir.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aozora-store-"));
vi.mock("electron", () => ({ app: { getPath: () => tmpDir } }));

// better-sqlite3 is a native module compiled for Electron's ABI. Under plain
// Node (Vitest) the binding usually fails to load with a NODE_MODULE_VERSION
// mismatch, and it only loads lazily on `new Database()`, not at import time,
// so probe the binding eagerly here and skip the suite when it can't load,
// rather than failing the run. (Rebuilding for Node's ABI would break the app,
// which needs the Electron build.)
let libraryStore: typeof import("@/main/services/library-store.js").libraryStore | null = null;
let loadError: unknown = null;
try {
  const Database = (await import("better-sqlite3")).default;
  new Database(":memory:").close(); // forces the native binding to load
  ({ libraryStore } = await import("@/main/services/library-store.js"));
} catch (err) {
  loadError = err;
}

const suite = libraryStore ? describe : describe.skip;
if (!libraryStore) {
  // Surface why the suite was skipped without failing the run.
  console.warn(`Skipping main library-store tests: ${(loadError as Error)?.message}`);
}

type InsertBookInput = Parameters<NonNullable<typeof libraryStore>["insertBook"]>[0];

suite("libraryStore (SQLite)", () => {
  const sample = (over: Partial<InsertBookInput> = {}) => ({
    id: over.id ?? "id-1",
    title: over.title ?? "Title",
    author: over.author,
    language: over.language,
    filePath: over.filePath ?? "/books/id-1/book.epub",
    coverPath: over.coverPath,
    fileSize: over.fileSize ?? 1234,
    addedAt: over.addedAt ?? 1000,
  });

  it("inserts a book and reads it back in the renderer (camelCase) shape", () => {
    const book = libraryStore!.insertBook(sample({ id: "ins-1", author: "Au", language: "ja" }));
    expect(book).toMatchObject({
      id: "ins-1",
      title: "Title",
      author: "Au",
      language: "ja",
      filePath: "/books/id-1/book.epub",
      fileSize: 1234,
      addedAt: 1000,
    });
    // Defaults applied by the schema.
    expect(book!.progress).toBe(0);
    expect(book!.exploredCharCount).toBe(0);
    expect(book!.charCount).toBe(0);
    expect(book!.lastOpenedAt).toBeNull();
  });

  it("getBook returns null for an unknown id", () => {
    expect(libraryStore!.getBook("does-not-exist")).toBeNull();
  });

  it("lists books newest-first by addedAt", () => {
    libraryStore!.insertBook(sample({ id: "old", addedAt: 100 }));
    libraryStore!.insertBook(sample({ id: "new", addedAt: 9999 }));
    const ids = libraryStore!.listBooks().map((b) => b.id);
    expect(ids.indexOf("new")).toBeLessThan(ids.indexOf("old"));
  });

  it("updateProgress writes only the provided fields", () => {
    libraryStore!.insertBook(sample({ id: "prog" }));
    const updated = libraryStore!.updateProgress("prog", {
      progress: 0.42,
      exploredCharCount: 500,
    });
    expect(updated!.progress).toBeCloseTo(0.42);
    expect(updated!.exploredCharCount).toBe(500);
    expect(updated!.charCount).toBe(0); // untouched
  });

  it("updateProgress with no fields is a no-op that returns the current row", () => {
    libraryStore!.insertBook(sample({ id: "noop", title: "Keep" }));
    const same = libraryStore!.updateProgress("noop", {});
    expect(same!.title).toBe("Keep");
  });

  it("removeBook deletes the row", () => {
    libraryStore!.insertBook(sample({ id: "del" }));
    expect(libraryStore!.getBook("del")).not.toBeNull();
    libraryStore!.removeBook("del");
    expect(libraryStore!.getBook("del")).toBeNull();
  });

  it("collects books into a shelf and drops them from it", () => {
    libraryStore!.insertBook(sample({ id: "c-a" }));
    libraryStore!.insertBook(sample({ id: "c-b" }));
    libraryStore!.createCollection({ id: "col-1", name: "Series", createdAt: 1 });

    expect(libraryStore!.addBooksToCollection("col-1", ["c-a", "c-b"], 10)!.bookIds).toEqual(["c-a", "c-b"]);
    expect(libraryStore!.removeBookFromCollection("col-1", "c-a")!.bookIds).toEqual(["c-b"]);
  });

  it("setBookCollections makes the memberships exact", () => {
    libraryStore!.insertBook(sample({ id: "s-1" }));
    libraryStore!.createCollection({ id: "col-x", name: "X", createdAt: 1 });
    libraryStore!.createCollection({ id: "col-y", name: "Y", createdAt: 2 });

    libraryStore!.setBookCollections("s-1", ["col-x"], 10);
    libraryStore!.setBookCollections("s-1", ["col-y"], 20);
    const on = libraryStore!.listCollections().filter((c) => c.bookIds.includes("s-1"));
    expect(on.map((c) => c.id)).toEqual(["col-y"]);
  });

  it("setCollectionBooks makes the shelf hold exactly the given books", () => {
    libraryStore!.insertBook(sample({ id: "b-1" }));
    libraryStore!.insertBook(sample({ id: "b-2" }));
    libraryStore!.insertBook(sample({ id: "b-3" }));
    libraryStore!.createCollection({ id: "col-bulk", name: "Bulk", createdAt: 1 });

    libraryStore!.setCollectionBooks("col-bulk", ["b-1", "b-2"], 10);
    // b-1 is kept, so it holds its place; b-3 joins at the end.
    expect(libraryStore!.setCollectionBooks("col-bulk", ["b-1", "b-3"], 20)!.bookIds).toEqual(["b-1", "b-3"]);
  });

  it("removing a book takes it off every shelf", () => {
    libraryStore!.insertBook(sample({ id: "gone" }));
    libraryStore!.createCollection({ id: "col-z", name: "Z", createdAt: 1 });
    libraryStore!.addBooksToCollection("col-z", ["gone"], 10);

    libraryStore!.removeBook("gone");
    expect(libraryStore!.getCollection("col-z")!.bookIds).toEqual([]);
  });
});
