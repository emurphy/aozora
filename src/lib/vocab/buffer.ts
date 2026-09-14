import type { VocabLookupInput } from "@/lib/types";

/**
 * Write buffer between the hover dictionary and the vocabulary store. Hover
 * scanning fires on every cursor move, so lookups are held here and flushed in
 * batches, and a word met again in the same book inside the dedupe window counts
 * once: re-reading a line (or nudging the cursor off the popup and back) would
 * otherwise inflate the counter.
 */

/** How long the same word in the same book stays deduplicated. */
export const DEDUPE_MS = 60_000;

// Bounds the dedupe map on a long reading run; oldest keys go first.
const RECENT_CAP = 300;

export interface VocabBuffer {
  pending: VocabLookupInput[];
  /** Occurrence key to when it was last accepted (survives a flush). */
  recent: Map<string, number>;
}

export function createVocabBuffer(): VocabBuffer {
  return { pending: [], recent: new Map() };
}

/**
 * A word's identity, matching the store's UNIQUE(expression, reading). Keys are
 * JSON so no separator character can collide with a headword.
 */
export function wordKey(expression: string, reading: string): string {
  return JSON.stringify([expression, reading]);
}

/**
 * Identity for deduplication. The char offset is deliberately out: it tracks the
 * reading position, which drifts by a character or two between two hovers of the
 * same word, and would defeat the window.
 */
export function occurrenceKey(item: VocabLookupInput): string {
  return JSON.stringify([item.expression, item.reading, item.bookId ?? ""]);
}

/** Queues a lookup. Returns false when the dedupe window swallowed it. */
export function pushLookup(buffer: VocabBuffer, item: VocabLookupInput, windowMs: number = DEDUPE_MS): boolean {
  const key = occurrenceKey(item);
  const last = buffer.recent.get(key);
  if (last != null && item.at - last < windowMs) return false;

  buffer.recent.delete(key); // re-insert so Map order stays least-recent-first
  buffer.recent.set(key, item.at);
  while (buffer.recent.size > RECENT_CAP) {
    const oldest = buffer.recent.keys().next();
    if (oldest.done) break;
    buffer.recent.delete(oldest.value);
  }

  buffer.pending.push(item);
  return true;
}

/** Empties the queue, keeping the dedupe history. */
export function drainLookups(buffer: VocabBuffer): VocabLookupInput[] {
  const items = buffer.pending;
  buffer.pending = [];
  return items;
}
