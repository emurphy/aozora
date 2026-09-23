import { toast } from "sonner";
import { reportImport } from "./import-report";
import { useLibraryStore, type ImportSummary } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";

/**
 * Imports started from outside the library page: the macOS File → Open… menu and
 * books opened from Finder. A single book opens in the reader (a duplicate opens
 * its existing copy); several land the user on the library. Navigation waits for
 * the result, so cancelling the picker leaves whatever was open alone.
 *
 * Runs are queued, never dropped: opening a second book while a big one is still
 * importing used to hit the store's `importing` flag and be lost silently.
 */

let queue: Promise<void> = Promise.resolve();

/** Resolves once no import is in flight (including one the library page started). */
function whenImportIdle(): Promise<void> {
  if (!useLibraryStore.getState().importing) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useLibraryStore.subscribe((state) => {
      if (state.importing) return;
      unsubscribe();
      resolve();
    });
  });
}

async function run(importer: () => Promise<ImportSummary>): Promise<void> {
  await whenImportIdle();
  try {
    const summary = await importer();
    reportImport(summary);
    if (summary.books.length === 1) {
      useReaderStore.getState().open(summary.books[0]);
    } else if (summary.books.length > 1) {
      useReaderStore.getState().close();
      useUiStore.getState().setView("library");
    }
  } catch {
    toast.error("Import failed");
  }
}

/** Queues an import behind any already running; resolves when this one is done. */
export function importAndOpen(importer: () => Promise<ImportSummary>): Promise<void> {
  queue = queue.then(() => run(importer));
  return queue;
}
