import { toDayKey } from "@/lib/stats/aggregate";
import type { VocabEntry } from "@/lib/types";

/**
 * Word-list serialisation for the vocabulary page's export. TSV is what Anki's
 * own importer expects; CSV is for spreadsheets.
 */

const HEADER = ["Expression", "Reading", "State", "Lookups", "First seen", "Last seen", "Book", "Sentence"];

function cells(entry: VocabEntry): string[] {
  return [
    entry.expression,
    entry.reading,
    entry.state,
    String(entry.lookupCount),
    toDayKey(new Date(entry.firstAt)),
    toDayKey(new Date(entry.lastAt)),
    entry.lastBookTitle ?? "",
    entry.lastSentence ?? "",
  ];
}

/** Quotes a CSV field per RFC 4180 (embedded quotes doubled). */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: VocabEntry[]): string {
  return [HEADER, ...rows.map(cells)].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** TSV has no quoting, so tabs and newlines inside a sentence become spaces. */
export function toTsv(rows: VocabEntry[]): string {
  const flatten = (value: string) => value.replace(/[\t\r\n]+/g, " ").trim();
  return [HEADER, ...rows.map(cells)].map((row) => row.map(flatten).join("\t")).join("\n");
}
