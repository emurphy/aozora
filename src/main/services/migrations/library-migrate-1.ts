import type Database from "better-sqlite3";
import type { Migration } from "./runner.js";

/**
 * SHA-256 of the imported .epub, so re-importing the same file is recognised
 * instead of creating a second book. NULL for books imported before this: they
 * are hashed on demand, only when an import has the same file size
 * (see findDuplicate in src/main/library.ts).
 *
 * The add is guarded so this is a no-op on a fresh DB (whose schema already
 * declares the column) yet still upgrades an existing user's DB.
 */
export const libraryMigrate1: Migration = {
  version: 1,
  name: "book-content-hash",
  up(db: Database.Database): void {
    const existing = new Set((db.prepare("PRAGMA table_info(books)").all() as { name: string }[]).map((c) => c.name));
    if (!existing.has("content_hash")) db.exec(`ALTER TABLE books ADD COLUMN content_hash TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_books_hash ON books(content_hash)`);
  },
};
