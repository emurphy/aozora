import { toast } from "sonner";
import type { DictionaryEntry, LookupResult, VocabEntry } from "@/lib/types";
import { buildNote, cardDataFromEntry, type MineStatus } from "@/lib/dictionary/anki-note";
import { useAnkiStore } from "@/stores/anki-store";

/**
 * Anki mining away from the reader (the Words page and its lookup panel). No
 * live match means no cloze: only the sentence and book title stored with the
 * word.
 */

interface Context {
  sentence?: string | null;
  bookTitle?: string | null;
}

export async function mineEntry(entry: DictionaryEntry, ctx: Context = {}): Promise<MineStatus> {
  const cfg = useAnkiStore.getState();
  if (!cfg.enabled || !cfg.deck || !cfg.model || Object.keys(cfg.fields).length === 0) {
    toast.error("Set up Anki in Settings first.");
    return "error";
  }

  const note = buildNote(
    cfg,
    cardDataFromEntry(entry, {
      sentence: ctx.sentence ?? "",
      documentTitle: ctx.bookTitle ?? "",
      documentAuthor: "",
    }),
  );

  const res = await window.electronAPI.anki.addNote({ server: cfg.server, apiKey: cfg.apiKey }, note);
  // Either outcome means a card exists, so the word counts as mined.
  if (res.ok || /duplicate/i.test(res.error)) {
    window.electronAPI.vocab.markMined(entry.expression, entry.reading ?? "").catch(() => {});
  }
  if (res.ok) {
    toast.success(`Added “${entry.expression}” to Anki.`);
    return "added";
  }
  if (/duplicate/i.test(res.error)) {
    toast.info(`“${entry.expression}” is already in Anki.`);
    return "duplicate";
  }
  toast.error(res.error);
  return "error";
}

/** The entry matching a saved word's reading, else the first one. */
export function pickEntry(result: LookupResult | null, expression: string, reading: string): DictionaryEntry | null {
  if (!result?.entries.length) return null;
  return result.entries.find((e) => e.expression === expression && (e.reading ?? "") === reading) ?? result.entries[0];
}

/** Mines a saved word: glossaries aren't stored, so it is looked up again first. */
export async function mineWord(word: VocabEntry): Promise<MineStatus> {
  const result = await window.electronAPI.dictionary.lookup(word.expression);
  const entry = pickEntry(result, word.expression, word.reading);
  if (!entry) {
    toast.error(`No dictionary entry for “${word.expression}”.`);
    return "error";
  }
  return mineEntry(entry, { sentence: word.lastSentence, bookTitle: word.lastBookTitle });
}
