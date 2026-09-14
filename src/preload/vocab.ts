import { ipcRenderer } from "electron";
import type { SetVocabStatePayload, VocabFilter, VocabLookupInput, VocabState } from "@/lib/types";

/**
 * Vocabulary API exposed as `window.electronAPI.vocab`. The reader records the
 * words it looks up; the vocabulary page reads and curates them.
 */
export const vocabApi = {
  /** Records a batch of lookups, returning the words they touched. */
  record: (items: VocabLookupInput[]) => ipcRenderer.invoke("vocab:record", items),

  list: (filter: VocabFilter) => ipcRenderer.invoke("vocab:list", filter),

  /** Every recorded sighting of one word, most recent first. */
  occurrences: (vocabId: string) => ipcRenderer.invoke("vocab:occurrences", vocabId),

  /** Sets one word's state, creating it if it was never captured. */
  setState: (payload: SetVocabStatePayload) => ipcRenderer.invoke("vocab:set-state", payload),

  setStateMany: (ids: string[], state: VocabState) => ipcRenderer.invoke("vocab:set-state-many", ids, state),

  /** Flags a word as mined to Anki (called after a card is added). */
  markMined: (expression: string, reading: string) => ipcRenderer.invoke("vocab:mark-mined", expression, reading),

  remove: (id: string) => ipcRenderer.invoke("vocab:remove", id),

  stats: () => ipcRenderer.invoke("vocab:stats"),
};
