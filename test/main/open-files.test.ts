// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// macOS delivers one `open-file` per file, so a multi-file Open With arrives as
// a burst. These cover the queue that turns a burst into one import.

const handlers = new Map<string, (...args: unknown[]) => void>();
const sent: { channel: string; files: { path: string }[] }[] = [];
const sender = {
  isDestroyed: () => false,
  once: vi.fn(),
  send: (channel: string, files: { path: string }[]) => sent.push({ channel, files }),
};

vi.mock("electron", () => ({
  app: { on: (event: string, fn: (...a: unknown[]) => void) => handlers.set(event, fn), isReady: () => true },
  BrowserWindow: { getAllWindows: () => [{}] },
  ipcMain: { on: (channel: string, fn: (...a: unknown[]) => void) => handlers.set(channel, fn) },
}));
vi.mock("node:fs", () => ({ default: { existsSync: () => true } }));
vi.mock("@/main/library.js", () => ({ allowUserFile: (path: string) => ({ path, name: path.split("/").pop(), size: 1 }) }));

const openFile = (path: string) => handlers.get("open-file")!({ preventDefault: () => {} }, path);
const subscribe = () => handlers.get("library:open-files-ready")!({ sender });

describe("open-file queue", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    sent.length = 0;
    handlers.clear();
    // Fresh module each time: its queue and subscriber are module state.
    vi.resetModules();
    const { registerOpenFiles } = await import("@/main/open-files.js");
    registerOpenFiles(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it("delivers a warm multi-file open as one batch", () => {
    subscribe();
    vi.advanceTimersByTime(200);
    sent.length = 0;

    openFile("/books/a.epub");
    openFile("/books/b.epub");
    openFile("/books/c.cbz");
    vi.advanceTimersByTime(200);

    expect(sent).toHaveLength(1);
    expect(sent[0].files.map((f) => f.path)).toEqual(["/books/a.epub", "/books/b.epub", "/books/c.cbz"]);
  });

  it("holds files opened before the renderer subscribes (cold launch)", () => {
    openFile("/books/a.epub");
    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(0);

    subscribe();
    vi.advanceTimersByTime(200);
    expect(sent[0].files.map((f) => f.path)).toEqual(["/books/a.epub"]);
  });

  it("sends separate opens separately", () => {
    subscribe();
    openFile("/books/a.epub");
    vi.advanceTimersByTime(200);
    openFile("/books/b.epub");
    vi.advanceTimersByTime(200);

    expect(sent.map((s) => s.files.map((f) => f.path))).toEqual([["/books/a.epub"], ["/books/b.epub"]]);
  });

  it("drops files that are not books or no longer exist", () => {
    subscribe();
    openFile("/books/notes.pdf");
    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(0);
  });
});
