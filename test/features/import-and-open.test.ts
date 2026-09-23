import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Book } from "@/lib/types";
import type { ImportSummary } from "@/stores/library-store";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

const { importAndOpen } = await import("@/features/library/import-and-open");
const { useLibraryStore } = await import("@/stores/library-store");
const { useReaderStore } = await import("@/stores/reader-store");
const { useUiStore } = await import("@/stores/ui-store");
const { toast } = await import("sonner");

const book = (id: string) => ({ id, title: id }) as Book;
const summary = (books: Book[]): ImportSummary => ({ added: books.length, duplicate: 0, failed: [], books });

/** A run that resolves when the returned `finish` is called. */
function deferred(books: Book[]) {
  let finish!: () => void;
  const done = new Promise<void>((r) => (finish = r));
  const importer = vi.fn(async () => {
    await done;
    return summary(books);
  });
  return { importer, finish };
}

describe("importAndOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReaderStore.getState().close();
    useLibraryStore.setState({ importing: false });
  });

  it("opens a single imported book in the reader", async () => {
    await importAndOpen(async () => summary([book("a")]));
    expect(useReaderStore.getState().currentBook?.id).toBe("a");
  });

  it("shows the library when several books came in", async () => {
    useUiStore.getState().setView("settings");
    await importAndOpen(async () => summary([book("a"), book("b")]));
    expect(useReaderStore.getState().currentBook).toBeNull();
    expect(useUiStore.getState().view).toBe("library");
  });

  it("leaves the open book alone when the picker is cancelled", async () => {
    useReaderStore.getState().open(book("open"));
    await importAndOpen(async () => summary([]));
    expect(useReaderStore.getState().currentBook?.id).toBe("open");
  });

  it("runs a second request that arrives mid-import instead of dropping it", async () => {
    // macOS sends one open-file per book, so a second can land while the first
    // import is still running; it must not be swallowed.
    const first = deferred([book("a")]);
    const second = deferred([book("b")]);

    const firstDone = importAndOpen(first.importer);
    const secondDone = importAndOpen(second.importer);
    expect(second.importer).not.toHaveBeenCalled(); // queued behind the first

    first.finish();
    await firstDone;
    await Promise.resolve(); // the queued run starts on the next microtask
    expect(second.importer).toHaveBeenCalledTimes(1);

    second.finish();
    await secondDone;
    expect(useReaderStore.getState().currentBook?.id).toBe("b");
  });

  it("waits for an import the library page started, rather than giving up", async () => {
    useLibraryStore.setState({ importing: true });
    const run = vi.fn(async () => summary([book("a")]));
    const done = importAndOpen(run);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();

    useLibraryStore.setState({ importing: false });
    await done;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reports a failed import and keeps the queue usable", async () => {
    await importAndOpen(async () => {
      throw new Error("boom");
    });
    expect(toast.error).toHaveBeenCalledWith("Import failed");

    await importAndOpen(async () => summary([book("a")]));
    expect(useReaderStore.getState().currentBook?.id).toBe("a");
  });
});
