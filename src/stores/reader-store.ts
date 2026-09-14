import { create } from "zustand";
import type { Book } from "@/lib/types";

interface ReaderState {
  currentBook: Book | null;
  /**
   * Where to open instead of the saved position (jumping to a word's occurrence
   * from the vocabulary page). The reader consumes it on load and clears it.
   */
  startChar: number | null;
  open: (book: Book, startChar?: number | null) => void;
  takeStartChar: () => number | null;
  close: () => void;
}

/** Tracks which book (if any) is currently open in the reader. */
export const useReaderStore = create<ReaderState>((set, get) => ({
  currentBook: null,
  startChar: null,
  open: (book, startChar = null) => set({ currentBook: book, startChar }),
  takeStartChar: () => {
    const { startChar } = get();
    if (startChar != null) set({ startChar: null });
    return startChar;
  },
  close: () => set({ currentBook: null, startChar: null }),
}));
