import { ipcMain, dialog, BrowserWindow } from "electron";
import fs from "node:fs";
import { libraryStore } from "./services/library-store.js";
import type { SetVocabStatePayload, VocabFilter, VocabLookupInput, VocabState } from "@/lib/types";

/**
 * Vocabulary IPC: the words looked up in the reader. Lookups arrive in batches
 * (the reader buffers them) and all aggregation happens in SQLite; the renderer
 * only renders what comes back.
 */
export const registerVocabIpc = (): void => {
  // Timestamps are taken here, not trusted from the renderer, so a word's
  // first_at can't be back-dated into a past heatmap day.
  ipcMain.handle("vocab:record", (_event, items: VocabLookupInput[]) => {
    if (!Array.isArray(items) || !items.length) return [];
    const now = Date.now();
    return libraryStore.recordLookups(items.map((item) => ({ ...item, at: now })));
  });

  ipcMain.handle("vocab:get-many", (_event, words: { expression: string; reading: string }[]) =>
    Array.isArray(words) ? libraryStore.getVocabMany(words) : [],
  );

  ipcMain.handle("vocab:list", (_event, filter: VocabFilter) => libraryStore.listVocab(filter ?? {}));

  ipcMain.handle("vocab:occurrences", (_event, vocabId: string) => libraryStore.listVocabOccurrences(vocabId));

  ipcMain.handle("vocab:set-state", (_event, { expression, reading, state }: SetVocabStatePayload) =>
    libraryStore.setVocabState(expression, reading ?? "", state, Date.now()),
  );

  ipcMain.handle("vocab:set-state-many", (_event, ids: string[], state: VocabState) => libraryStore.setVocabStateByIds(ids, state));

  ipcMain.handle("vocab:mark-mined", (_event, expression: string, reading: string) =>
    libraryStore.markVocabMined(expression, reading ?? "", Date.now()),
  );

  ipcMain.handle("vocab:remove", (_event, id: string) => {
    libraryStore.removeVocab(id);
    return true;
  });

  ipcMain.handle("vocab:stats", () => libraryStore.getVocabStats());

  // The renderer formats the rows (it owns the filtering); this only picks the
  // destination and writes, since a sandboxed page can't save a file itself.
  ipcMain.handle("vocab:export", async (event, suggestedName: string, contents: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showSaveDialog(window, { defaultPath: suggestedName })
      : await dialog.showSaveDialog({ defaultPath: suggestedName });
    if (result.canceled || !result.filePath) return { ok: false as const, canceled: true as const };
    try {
      fs.writeFileSync(result.filePath, contents, "utf8");
      return { ok: true as const, path: result.filePath };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });
};
