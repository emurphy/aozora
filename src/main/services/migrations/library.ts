import type { Migration } from "./runner.js";
import { libraryMigrate1 } from "./library-migrate-1.js";

/**
 * Migrations for the library database (userData/aozora.db), in ascending version
 * order. Append the next `library-migrate-N.ts` here as the schema evolves.
 *
 * A whole new table needs no entry: the store's `CREATE TABLE IF NOT EXISTS`
 * block adds it to an existing DB by itself. A new *column* on an existing table
 * does, because that block is skipped entirely once the table exists.
 */
export const libraryMigrations: Migration[] = [libraryMigrate1];
