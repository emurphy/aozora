import { describe, expect, it } from "vitest";
import { createVocabBuffer, drainLookups, occurrenceKey, pushLookup, wordKey } from "@/lib/vocab/buffer";
import type { VocabLookupInput } from "@/lib/types";

function lookup(overrides: Partial<VocabLookupInput> = {}): VocabLookupInput {
  return {
    expression: "食べる",
    reading: "たべる",
    bookId: "book-1",
    charOffset: 120,
    surface: "食べさせられた",
    sentence: "ご飯を食べさせられた。",
    at: 1_000_000,
    ...overrides,
  };
}

describe("vocab buffer", () => {
  it("keeps homographs apart but ignores the drifting char offset", () => {
    expect(wordKey("生", "なま")).not.toBe(wordKey("生", "せい"));
    expect(occurrenceKey(lookup({ charOffset: 10 }))).toBe(occurrenceKey(lookup({ charOffset: 4000 })));
    expect(occurrenceKey(lookup({ bookId: "book-2" }))).not.toBe(occurrenceKey(lookup()));
  });

  it("counts the same word in the same book once per window", () => {
    const buffer = createVocabBuffer();
    expect(pushLookup(buffer, lookup({ at: 1000 }))).toBe(true);
    expect(pushLookup(buffer, lookup({ at: 5000 }))).toBe(false); // re-read the line
    expect(pushLookup(buffer, lookup({ at: 1000 + 60_000 }))).toBe(true);
    expect(buffer.pending).toHaveLength(2);
  });

  it("scopes the dedupe to the word and book", () => {
    const buffer = createVocabBuffer();
    pushLookup(buffer, lookup({ at: 1000 }));
    expect(pushLookup(buffer, lookup({ at: 1100, expression: "走る" }))).toBe(true);
    expect(pushLookup(buffer, lookup({ at: 1200, bookId: "book-2" }))).toBe(true);
    expect(pushLookup(buffer, lookup({ at: 1300, reading: "" }))).toBe(true);
  });

  it("drains the queue but remembers what it already accepted", () => {
    const buffer = createVocabBuffer();
    pushLookup(buffer, lookup({ at: 1000 }));
    expect(drainLookups(buffer)).toHaveLength(1);
    expect(drainLookups(buffer)).toHaveLength(0);
    expect(pushLookup(buffer, lookup({ at: 2000 }))).toBe(false); // flush is not a reset
  });

  it("bounds the dedupe history on a long reading run", () => {
    const buffer = createVocabBuffer();
    for (let i = 0; i < 400; i += 1) pushLookup(buffer, lookup({ expression: `word-${i}`, at: 1000 + i }));
    expect(buffer.recent.size).toBeLessThanOrEqual(300);
    // The oldest keys went first, so the earliest word is accepted again.
    expect(pushLookup(buffer, lookup({ expression: "word-0", at: 1400 }))).toBe(true);
  });
});
