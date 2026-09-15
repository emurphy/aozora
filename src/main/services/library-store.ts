import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations, libraryMigrations } from "./migrations/index.js";
import { toDayKey } from "@/lib/stats/aggregate";
import type {
  Book,
  Bookmark,
  Annotation,
  ProgressUpdate,
  StatsOverview,
  DailyActivity,
  HourlyActivity,
  PerBookStats,
  VocabEntry,
  VocabFilter,
  VocabLookupInput,
  VocabOccurrence,
  VocabState,
  VocabStats,
} from "@/lib/types";

/**
 * SQLite-backed library store: source of truth for book metadata and reading
 * progress. Parsed EPUB content is NOT stored here: it lives in the renderer's
 * IndexedDB cache, re-derivable from the original file.
 *
 * On-disk layout (under Electron userData):
 *   userData/aozora.db                  the SQLite database
 *   userData/books/<id>/book.epub       the imported original file
 *   userData/books/<id>/cover.<ext>     extracted cover image (optional)
 */

let db: Database.Database | undefined;

// Prepared-statement cache keyed by SQL text. better-sqlite3 recompiles on every
// .prepare(), so hot handlers (save-progress fires on scroll/page-flip) would pay
// that cost repeatedly. Reset whenever the DB handle is (re)created.
let stmtCache = new Map<string, Database.Statement>();

function getBooksDir(): string {
  return path.join(app.getPath("userData"), "books");
}

function stmt(sql: string): Database.Statement {
  const cached = stmtCache.get(sql);
  if (cached) return cached;
  const prepared = getDb().prepare(sql);
  stmtCache.set(sql, prepared);
  return prepared;
}

/**
 * Runs a dynamic UPDATE writing only the defined columns (undefined ⇒ untouched).
 * Each entry is [column, value]; the column doubles as its @named parameter. A
 * no-op when nothing is provided. Callers re-read the row for the return value.
 */
function runUpdate(table: string, id: string, columns: Array<[string, string | number | null | undefined]>): void {
  const sets: string[] = [];
  const params: SqlParams = { id };
  for (const [column, value] of columns) {
    if (value === undefined) continue;
    sets.push(`${column} = @${column}`);
    params[column] = value;
  }
  if (!sets.length) return;
  stmt(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(app.getPath("userData"), "aozora.db");
  fs.mkdirSync(getBooksDir(), { recursive: true });

  stmtCache = new Map(); // statements are bound to a handle; drop stale ones
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON"); // so bookmarks cascade-delete with their book
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id                  TEXT PRIMARY KEY,
      title               TEXT NOT NULL,
      author              TEXT,
      language            TEXT,
      file_path           TEXT NOT NULL,
      cover_path          TEXT,
      file_size           INTEGER,
      added_at            INTEGER NOT NULL,
      last_opened_at      INTEGER,
      progress            REAL    NOT NULL DEFAULT 0,
      explored_char_count INTEGER NOT NULL DEFAULT 0,
      char_count          INTEGER NOT NULL DEFAULT 0,
      favorite            INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id          TEXT PRIMARY KEY,
      book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      char_offset INTEGER NOT NULL,
      progress    REAL    NOT NULL DEFAULT 0,
      snippet     TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);

    -- Highlighted / annotated spans, anchored by character offset (like
    -- bookmarks) so they survive re-flow. Cascade-deleted with their book.
    CREATE TABLE IF NOT EXISTS annotations (
      id          TEXT PRIMARY KEY,
      book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      start_char  INTEGER NOT NULL,
      end_char    INTEGER NOT NULL,
      color       TEXT    NOT NULL DEFAULT 'yellow',
      note        TEXT,
      snippet     TEXT,
      progress    REAL    NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id);

    -- One row per reading session; the time-series behind the stats page (books
    -- keeps only the latest position). book_id is SET NULL (not cascade) on book
    -- removal so totals/streaks survive a deleted book.
    CREATE TABLE IF NOT EXISTS reading_sessions (
      id          TEXT PRIMARY KEY,
      book_id     TEXT REFERENCES books(id) ON DELETE SET NULL,
      started_at  INTEGER NOT NULL,  -- epoch ms
      ended_at    INTEGER NOT NULL,  -- epoch ms
      duration_ms INTEGER NOT NULL DEFAULT 0,  -- active time, idle gaps excluded
      chars_read  INTEGER NOT NULL DEFAULT 0   -- 0 for fixed-layout (manga) sessions
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON reading_sessions(started_at);

    -- One row per word looked up in the reader. Identity is expression+reading,
    -- so homographs (生, 開く) stay separate entries. reading is '' rather than
    -- NULL for a kana-only headword: SQLite treats NULLs as distinct, which
    -- would let the UNIQUE pair admit duplicates.
    CREATE TABLE IF NOT EXISTS vocab (
      id           TEXT PRIMARY KEY,
      expression   TEXT NOT NULL,
      reading      TEXT NOT NULL DEFAULT '',
      state        TEXT NOT NULL DEFAULT 'new',  -- new | learning | known | ignored
      lookup_count INTEGER NOT NULL DEFAULT 0,
      first_at     INTEGER NOT NULL,
      last_at      INTEGER NOT NULL,
      mined_at     INTEGER,                      -- when an Anki card was made, else NULL
      UNIQUE(expression, reading)
    );

    -- Where each lookup happened. Kept apart from vocab so the word survives the
    -- book (SET NULL, like reading_sessions) and so "met 4 times" can be listed.
    CREATE TABLE IF NOT EXISTS vocab_lookups (
      id          TEXT PRIMARY KEY,
      vocab_id    TEXT NOT NULL REFERENCES vocab(id) ON DELETE CASCADE,
      book_id     TEXT REFERENCES books(id) ON DELETE SET NULL,
      char_offset INTEGER,
      surface     TEXT,   -- the inflected form on the page
      sentence    TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vocab_lookups_vocab ON vocab_lookups(vocab_id);
    CREATE INDEX IF NOT EXISTS idx_vocab_lookups_created ON vocab_lookups(created_at);
  `);

  runMigrations(db, libraryMigrations);

  return db;
}

/** Raw DB rows (snake_case columns) as returned by better-sqlite3. */
interface BookRow {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  file_path: string;
  cover_path: string | null;
  file_size: number | null;
  added_at: number;
  last_opened_at: number | null;
  progress: number;
  explored_char_count: number;
  char_count: number;
  favorite: number;
}

interface BookmarkRow {
  id: string;
  book_id: string;
  char_offset: number;
  progress: number;
  snippet: string | null;
  created_at: number;
}

interface AnnotationRow {
  id: string;
  book_id: string;
  start_char: number;
  end_char: number;
  color: string;
  note: string | null;
  snippet: string | null;
  progress: number;
  created_at: number;
}

/** A vocab row joined to its most recent lookup (see listVocab). */
interface VocabRow {
  id: string;
  expression: string;
  reading: string;
  state: string;
  lookup_count: number;
  first_at: number;
  last_at: number;
  mined_at: number | null;
  last_book_id: string | null;
  last_book_title: string | null;
  last_surface: string | null;
  last_sentence: string | null;
}

interface VocabOccurrenceRow {
  id: string;
  book_id: string | null;
  book_title: string | null;
  char_offset: number | null;
  surface: string | null;
  sentence: string | null;
  created_at: number;
}

/** Named-parameter bag for prepared statements. */
type SqlParams = Record<string, string | number | null>;

/**
 * Every vocab read goes through this: the word joined to its newest occurrence,
 * so a list row can show where it was last met without a second query. Callers
 * append their own WHERE / ORDER BY.
 */
const VOCAB_SELECT = `
  SELECT v.id, v.expression, v.reading, v.state, v.lookup_count, v.first_at, v.last_at, v.mined_at,
         l.book_id  AS last_book_id,
         l.surface  AS last_surface,
         l.sentence AS last_sentence,
         b.title    AS last_book_title
    FROM vocab v
    LEFT JOIN vocab_lookups l ON l.id = (
      SELECT id FROM vocab_lookups WHERE vocab_id = v.id ORDER BY created_at DESC, rowid DESC LIMIT 1
    )
    LEFT JOIN books b ON b.id = l.book_id`;

/** Maps a DB row (snake_case) to the camelCase shape the renderer consumes. */
function rowToBook(row: BookRow | undefined): Book | null {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? null,
    language: row.language ?? null,
    filePath: row.file_path,
    coverPath: row.cover_path ?? null,
    fileSize: row.file_size ?? null,
    addedAt: row.added_at,
    lastOpenedAt: row.last_opened_at ?? null,
    progress: row.progress,
    exploredCharCount: row.explored_char_count,
    charCount: row.char_count,
    favorite: row.favorite === 1,
  };
}

/** Maps a bookmark DB row to the camelCase shape the renderer consumes. */
function rowToBookmark(row: BookmarkRow | undefined): Bookmark | null {
  if (!row) return null;
  return {
    id: row.id,
    bookId: row.book_id,
    charOffset: row.char_offset,
    progress: row.progress,
    snippet: row.snippet ?? null,
    createdAt: row.created_at,
  };
}

/** Maps an annotation DB row to the camelCase shape the renderer consumes. */
function rowToAnnotation(row: AnnotationRow | undefined): Annotation | null {
  if (!row) return null;
  return {
    id: row.id,
    bookId: row.book_id,
    startChar: row.start_char,
    endChar: row.end_char,
    color: row.color,
    note: row.note ?? null,
    snippet: row.snippet ?? null,
    progress: row.progress,
    createdAt: row.created_at,
  };
}

/** Maps a vocab row (joined to its latest lookup) to the renderer's shape. */
function rowToVocab(row: VocabRow | undefined): VocabEntry | null {
  if (!row) return null;
  return {
    id: row.id,
    expression: row.expression,
    reading: row.reading,
    state: row.state as VocabState,
    lookupCount: row.lookup_count,
    firstAt: row.first_at,
    lastAt: row.last_at,
    minedAt: row.mined_at ?? null,
    lastBookId: row.last_book_id ?? null,
    lastBookTitle: row.last_book_title ?? null,
    lastSurface: row.last_surface ?? null,
    lastSentence: row.last_sentence ?? null,
  };
}

interface InsertBookInput {
  id: string;
  title: string;
  author?: string | null;
  language?: string | null;
  filePath: string;
  coverPath?: string | null;
  fileSize?: number | null;
  addedAt: number;
}

interface AddBookmarkInput {
  id: string;
  bookId: string;
  charOffset?: number;
  progress?: number;
  snippet?: string | null;
  createdAt: number;
}

interface AddAnnotationInput {
  id: string;
  bookId: string;
  startChar: number;
  endChar: number;
  color: string;
  note?: string | null;
  snippet?: string | null;
  progress?: number;
  createdAt: number;
}

interface RecordSessionInput {
  id: string;
  bookId: string | null;
  startedAt: number;
  endedAt: number;
  durationMs?: number;
  charsRead?: number;
}

export const libraryStore = {
  getBooksDir,

  /** Closes the DB handle so its file can be deleted (see system:clear-all-data). */
  close(): void {
    if (db) {
      db.close();
      db = undefined;
      stmtCache = new Map(); // cached statements belong to the closed handle
    }
  },

  /**
   * Writes a consistent copy of the DB to `target` (for a backup). VACUUM INTO
   * folds in the WAL; a plain file copy of a WAL database would not.
   */
  snapshotTo(target: string): void {
    fs.rmSync(target, { force: true }); // VACUUM INTO refuses an existing file
    getDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  },

  /**
   * Reports a missing column this build reads, or null. Restores need it: an
   * older DB is carried forward by the migrations, but a backup written by a
   * NEWER build can hold a shape this one never learned, and migrations only
   * run forwards.
   */
  schemaError(): string | null {
    const canaries: Record<string, string> = {
      books: "id, title, author, language, file_path, cover_path, file_size, added_at, last_opened_at, progress, explored_char_count, char_count, favorite",
      bookmarks: "id, book_id, char_offset, progress, snippet, created_at",
      annotations: "id, book_id, start_char, end_char, color, note, snippet, progress, created_at",
      reading_sessions: "id, book_id, started_at, ended_at, duration_ms, chars_read",
      vocab: "id, expression, reading, state, lookup_count, first_at, last_at, mined_at",
      vocab_lookups: "id, vocab_id, book_id, char_offset, surface, sentence, created_at",
    };
    for (const [table, columns] of Object.entries(canaries)) {
      try {
        getDb().prepare(`SELECT ${columns} FROM ${table} LIMIT 0`).run();
      } catch (err) {
        return `table "${table}" is missing columns this version needs (${err instanceof Error ? err.message : String(err)})`;
      }
    }
    return null;
  },

  /**
   * Repoints every book at the local layout, returning the ids whose .epub is
   * missing. Needed after a restore: paths are stored absolute, so a backup from
   * another machine carries paths that don't exist here. The layout is derivable
   * (`books/<id>/book.epub` + sibling cover), so rows are rebuilt, not trusted.
   */
  relocateBooks(): string[] {
    const missing: string[] = [];
    const rows = stmt("SELECT id FROM books").all() as { id: string }[];
    const update = stmt("UPDATE books SET file_path = @filePath, cover_path = @coverPath WHERE id = @id");

    for (const { id } of rows) {
      const dir = path.join(getBooksDir(), id);
      const filePath = path.join(dir, "book.epub");
      if (!fs.existsSync(filePath)) missing.push(id);
      const cover = fs.existsSync(dir) ? fs.readdirSync(dir).find((name) => name.startsWith("cover.")) : undefined;
      update.run({ id, filePath, coverPath: cover ? path.join(dir, cover) : null });
    }
    return missing;
  },

  listBooks(): Book[] {
    const rows = stmt("SELECT * FROM books ORDER BY added_at DESC").all() as BookRow[];
    return rows.map(rowToBook) as Book[];
  },

  getBook(id: string): Book | null {
    const row = stmt("SELECT * FROM books WHERE id = ?").get(id) as BookRow | undefined;
    return rowToBook(row);
  },

  insertBook(book: InsertBookInput): Book | null {
    stmt(
      `INSERT INTO books
           (id, title, author, language, file_path, cover_path, file_size, added_at)
         VALUES
           (@id, @title, @author, @language, @filePath, @coverPath, @fileSize, @addedAt)`,
    ).run({
      id: book.id,
      title: book.title,
      author: book.author ?? null,
      language: book.language ?? null,
      filePath: book.filePath,
      coverPath: book.coverPath ?? null,
      fileSize: book.fileSize ?? null,
      addedAt: book.addedAt,
    });
    return this.getBook(book.id);
  },

  removeBook(id: string): void {
    stmt("DELETE FROM books WHERE id = ?").run(id);
  },

  /** Updates editable book metadata; only the provided fields are written. */
  updateBook(id: string, { title, author, coverPath }: { title?: string; author?: string | null; coverPath?: string }): Book | null {
    runUpdate("books", id, [
      ["title", title],
      ["author", author],
      ["cover_path", coverPath],
    ]);
    return this.getBook(id);
  },

  /** Updates reading progress; only the provided fields are written. */
  updateProgress(id: string, { progress, exploredCharCount, charCount, lastOpenedAt }: ProgressUpdate): Book | null {
    runUpdate("books", id, [
      ["progress", progress],
      ["explored_char_count", exploredCharCount],
      ["char_count", charCount],
      ["last_opened_at", lastOpenedAt],
    ]);
    return this.getBook(id);
  },

  /** Marks a book as favorite (true) or not (false). */
  setFavorite(id: string, favorite: boolean): Book | null {
    stmt("UPDATE books SET favorite = @favorite WHERE id = @id").run({ id, favorite: favorite ? 1 : 0 });
    return this.getBook(id);
  },

  // --- Bookmarks (per book, ordered by reading position). ------------------

  listBookmarks(bookId: string): Bookmark[] {
    const rows = stmt("SELECT * FROM bookmarks WHERE book_id = ? ORDER BY char_offset ASC, created_at ASC").all(bookId) as BookmarkRow[];
    return rows.map(rowToBookmark) as Bookmark[];
  },

  getBookmark(id: string): Bookmark | null {
    return rowToBookmark(stmt("SELECT * FROM bookmarks WHERE id = ?").get(id) as BookmarkRow | undefined);
  },

  addBookmark({ id, bookId, charOffset, progress, snippet, createdAt }: AddBookmarkInput): Bookmark | null {
    stmt(
      `INSERT INTO bookmarks (id, book_id, char_offset, progress, snippet, created_at)
         VALUES (@id, @bookId, @charOffset, @progress, @snippet, @createdAt)`,
    ).run({
      id,
      bookId,
      charOffset: charOffset ?? 0,
      progress: progress ?? 0,
      snippet: snippet ?? null,
      createdAt,
    });
    return this.getBookmark(id);
  },

  removeBookmark(id: string): void {
    stmt("DELETE FROM bookmarks WHERE id = ?").run(id);
  },

  // --- Annotations (highlights + notes, per book, in reading order). --------

  listAnnotations(bookId: string): Annotation[] {
    const rows = stmt("SELECT * FROM annotations WHERE book_id = ? ORDER BY start_char ASC, created_at ASC").all(bookId) as AnnotationRow[];
    return rows.map(rowToAnnotation) as Annotation[];
  },

  getAnnotation(id: string): Annotation | null {
    return rowToAnnotation(stmt("SELECT * FROM annotations WHERE id = ?").get(id) as AnnotationRow | undefined);
  },

  addAnnotation({ id, bookId, startChar, endChar, color, note, snippet, progress, createdAt }: AddAnnotationInput): Annotation | null {
    stmt(
      `INSERT INTO annotations (id, book_id, start_char, end_char, color, note, snippet, progress, created_at)
         VALUES (@id, @bookId, @startChar, @endChar, @color, @note, @snippet, @progress, @createdAt)`,
    ).run({
      id,
      bookId,
      startChar,
      endChar,
      color,
      note: note ?? null,
      snippet: snippet ?? null,
      progress: progress ?? 0,
      createdAt,
    });
    return this.getAnnotation(id);
  },

  /** Updates an annotation's colour and/or note; only provided fields are written. */
  updateAnnotation(id: string, { color, note }: { color?: string; note?: string | null }): Annotation | null {
    runUpdate("annotations", id, [
      ["color", color],
      ["note", note],
    ]);
    return this.getAnnotation(id);
  },

  removeAnnotation(id: string): void {
    stmt("DELETE FROM annotations WHERE id = ?").run(id);
  },

  // --- Reading sessions (time-series for the stats page). -------------------

  /** Inserts one completed reading session. */
  recordSession({ id, bookId, startedAt, endedAt, durationMs, charsRead }: RecordSessionInput): void {
    stmt(
      `INSERT INTO reading_sessions (id, book_id, started_at, ended_at, duration_ms, chars_read)
         VALUES (@id, @bookId, @startedAt, @endedAt, @durationMs, @charsRead)`,
    ).run({
      id,
      bookId: bookId ?? null,
      startedAt,
      endedAt,
      durationMs: Math.max(0, Math.round(durationMs ?? 0)),
      charsRead: Math.max(0, Math.round(charsRead ?? 0)),
    });
  },

  /** All-time totals across every session (single row). */
  getStatsOverview(): StatsOverview {
    return stmt(
      `SELECT
           COALESCE(SUM(chars_read), 0)  AS totalChars,
           COALESCE(SUM(duration_ms), 0) AS totalMs,
           COUNT(*)                      AS sessionCount,
           COUNT(DISTINCT date(started_at / 1000, 'unixepoch', 'localtime')) AS activeDays,
           MIN(started_at)               AS firstAt
         FROM reading_sessions`,
    ).get() as StatsOverview;
  },

  /**
   * Per-day activity, bucketed by LOCAL calendar day ('YYYY-MM-DD'). Feeds the
   * heatmap, streak calc and daily trend chart. Ordered oldest-first.
   */
  getDailyActivity(): DailyActivity[] {
    return stmt(
      `SELECT date(started_at / 1000, 'unixepoch', 'localtime') AS day,
                SUM(chars_read)            AS chars,
                SUM(duration_ms)           AS ms,
                COUNT(*)                   AS sessions,
                COUNT(DISTINCT book_id)    AS books
           FROM reading_sessions
          GROUP BY day
          ORDER BY day ASC`,
    ).all() as DailyActivity[];
  },

  /** Activity grouped by local hour-of-day (0–23). Drives the rhythm chart. */
  getHourlyActivity(): HourlyActivity[] {
    return stmt(
      `SELECT CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                SUM(chars_read)  AS chars,
                SUM(duration_ms) AS ms
           FROM reading_sessions
          GROUP BY hour
          ORDER BY hour ASC`,
    ).all() as HourlyActivity[];
  },

  /** Per-book totals (joined to current title/author; deleted books drop out). */
  getPerBookStats(): PerBookStats[] {
    return stmt(
      `SELECT s.book_id            AS bookId,
                b.title              AS title,
                b.author             AS author,
                SUM(s.chars_read)    AS chars,
                SUM(s.duration_ms)   AS ms,
                COUNT(*)             AS sessions,
                MAX(s.ended_at)      AS lastAt
           FROM reading_sessions s
           LEFT JOIN books b ON b.id = s.book_id
          WHERE s.book_id IS NOT NULL
          GROUP BY s.book_id
          ORDER BY ms DESC`,
    ).all() as PerBookStats[];
  },

  // --- Vocabulary (words looked up in the reader). --------------------------

  /**
   * Upserts a batch of lookups: each word's counter is bumped and the occurrence
   * logged. One transaction because the reader flushes a whole reading run at
   * once. Returns the touched words so the popup can show their state.
   */
  recordLookups(items: VocabLookupInput[]): VocabEntry[] {
    if (!items.length) return [];
    const touched = new Set<string>();

    const apply = getDb().transaction((batch: VocabLookupInput[]) => {
      for (const item of batch) {
        const expression = item.expression.trim();
        if (!expression) continue;
        const reading = (item.reading || "").trim();
        const at = item.at || Date.now();

        // The id only matters when the row is new, so it is minted here rather
        // than by the IPC layer: the caller can't know which branch will run.
        stmt(
          `INSERT INTO vocab (id, expression, reading, state, lookup_count, first_at, last_at)
                VALUES (@id, @expression, @reading, 'new', 1, @at, @at)
           ON CONFLICT(expression, reading) DO UPDATE SET
                lookup_count = vocab.lookup_count + 1,
                last_at      = MAX(vocab.last_at, excluded.last_at)`,
        ).run({ id: randomUUID(), expression, reading, at });

        const id = stmt("SELECT id FROM vocab WHERE expression = @expression AND reading = @reading").get({ expression, reading }) as
          | { id: string }
          | undefined;
        if (!id) continue;
        touched.add(id.id);

        stmt(
          `INSERT INTO vocab_lookups (id, vocab_id, book_id, char_offset, surface, sentence, created_at)
                VALUES (@id, @vocabId, @bookId, @charOffset, @surface, @sentence, @at)`,
        ).run({
          id: randomUUID(),
          vocabId: id.id,
          bookId: item.bookId ?? null,
          charOffset: item.charOffset ?? null,
          surface: item.surface ?? null,
          sentence: item.sentence ?? null,
          at,
        });
      }
    });
    apply(items);

    return [...touched].flatMap((id) => {
      const row = stmt(`${VOCAB_SELECT} WHERE v.id = @id`).get({ id }) as VocabRow | undefined;
      const entry = rowToVocab(row);
      return entry ? [entry] : [];
    });
  },

  getVocab(expression: string, reading: string): VocabEntry | null {
    const row = stmt(`${VOCAB_SELECT} WHERE v.expression = @expression AND v.reading = @reading`).get({ expression, reading }) as
      | VocabRow
      | undefined;
    return rowToVocab(row);
  },

  /** Words matching the filter, most recently met first. */
  listVocab({ state, bookId, search, limit }: VocabFilter): VocabEntry[] {
    const where: string[] = [];
    const params: SqlParams = { limit: Math.min(Math.max(limit ?? 1000, 1), 5000) };
    if (state && state !== "all") {
      where.push("v.state = @state");
      params.state = state;
    }
    if (bookId) {
      where.push("EXISTS (SELECT 1 FROM vocab_lookups x WHERE x.vocab_id = v.id AND x.book_id = @bookId)");
      params.bookId = bookId;
    }
    const q = search?.trim();
    if (q) {
      where.push("(v.expression LIKE @q OR v.reading LIKE @q)");
      params.q = `%${q}%`;
    }
    const sql = `${VOCAB_SELECT}
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY v.last_at DESC
        LIMIT @limit`;
    const rows = stmt(sql).all(params) as VocabRow[];
    return rows.map(rowToVocab) as VocabEntry[];
  },

  /** Every recorded sighting of one word, most recent first. */
  listVocabOccurrences(vocabId: string): VocabOccurrence[] {
    const rows = stmt(
      `SELECT l.id, l.book_id, l.char_offset, l.surface, l.sentence, l.created_at, b.title AS book_title
           FROM vocab_lookups l
           LEFT JOIN books b ON b.id = l.book_id
          WHERE l.vocab_id = @vocabId
          ORDER BY l.created_at DESC`,
    ).all({ vocabId }) as VocabOccurrenceRow[];
    return rows.map((row) => ({
      id: row.id,
      bookId: row.book_id ?? null,
      bookTitle: row.book_title ?? null,
      charOffset: row.char_offset ?? null,
      surface: row.surface ?? null,
      sentence: row.sentence ?? null,
      createdAt: row.created_at,
    }));
  },

  /** Sets a word's state, creating the row when the word was never captured. */
  setVocabState(expression: string, reading: string, state: VocabState, now: number): VocabEntry | null {
    stmt(
      `INSERT INTO vocab (id, expression, reading, state, lookup_count, first_at, last_at)
            VALUES (@id, @expression, @reading, @state, 0, @now, @now)
       ON CONFLICT(expression, reading) DO UPDATE SET state = excluded.state`,
    ).run({ id: randomUUID(), expression, reading, state, now });
    return this.getVocab(expression, reading);
  },

  /** Flags a word as mined to Anki; an untouched word also graduates to learning. */
  markVocabMined(expression: string, reading: string, now: number): VocabEntry | null {
    stmt(
      `INSERT INTO vocab (id, expression, reading, state, lookup_count, first_at, last_at, mined_at)
            VALUES (@id, @expression, @reading, 'learning', 0, @now, @now, @now)
       ON CONFLICT(expression, reading) DO UPDATE SET
            mined_at = @now,
            state    = CASE WHEN vocab.state = 'new' THEN 'learning' ELSE vocab.state END`,
    ).run({ id: randomUUID(), expression, reading, now });
    return this.getVocab(expression, reading);
  },

  removeVocab(id: string): void {
    stmt("DELETE FROM vocab WHERE id = ?").run(id);
  },

  /** Totals and per-day series behind the vocabulary widgets on the stats page. */
  getVocabStats(): VocabStats {
    const totals = stmt(
      `SELECT COUNT(*)                              AS total,
              COALESCE(SUM(lookup_count), 0)        AS lookupCount,
              COALESCE(SUM(mined_at IS NOT NULL), 0) AS minedCount
         FROM vocab`,
    ).get() as { total: number; lookupCount: number; minedCount: number };

    const byState: Record<VocabState, number> = { new: 0, learning: 0, known: 0, ignored: 0 };
    for (const row of stmt("SELECT state, COUNT(*) AS n FROM vocab GROUP BY state").all() as { state: VocabState; n: number }[]) {
      if (row.state in byState) byState[row.state] = row.n;
    }

    // Two series keyed by local day: words first met, and lookups made.
    const merged = new Map<string, { day: string; words: number; lookups: number }>();
    const bump = (day: string, key: "words" | "lookups", n: number) => {
      const row = merged.get(day) ?? { day, words: 0, lookups: 0 };
      row[key] = n;
      merged.set(day, row);
    };
    for (const row of stmt(
      `SELECT date(first_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS n FROM vocab GROUP BY day`,
    ).all() as { day: string; n: number }[]) {
      bump(row.day, "words", row.n);
    }
    for (const row of stmt(
      `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS n FROM vocab_lookups GROUP BY day`,
    ).all() as { day: string; n: number }[]) {
      bump(row.day, "lookups", row.n);
    }
    const daily = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));

    return {
      total: totals.total,
      lookupCount: totals.lookupCount,
      byState,
      minedCount: totals.minedCount,
      newToday: merged.get(toDayKey(new Date()))?.words ?? 0,
      daily,
    };
  },
};
