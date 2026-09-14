import type { Migration } from "./runner.js";

/**
 * Migrations for the library database (userData/aozora.db), in ascending version
 * order. Append the next `library-migrate-N.ts` here as the schema evolves.
 *
 * Empty is correct while every change so far is a whole new table: the store's
 * `CREATE TABLE IF NOT EXISTS` block adds those to an existing DB by itself. A
 * new *column* on an existing table needs an entry here, because that block is
 * skipped entirely once the table exists.
 */
export const libraryMigrations: Migration[] = [];
