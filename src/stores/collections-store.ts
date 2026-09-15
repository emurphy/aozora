import { create } from "zustand";
import type { Collection } from "@/lib/types";

const api = () => window.electronAPI.library;

interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  load: () => Promise<void>;
  createCollection: (name: string) => Promise<Collection | null>;
  renameCollection: (id: string, name: string) => Promise<void>;
  removeCollection: (id: string) => Promise<void>;
  addBooksToCollection: (id: string, bookIds: string[]) => Promise<void>;
  removeBookFromCollection: (id: string, bookId: string) => Promise<void>;
  setCollectionBooks: (id: string, bookIds: string[]) => Promise<void>;
  setBookCollections: (bookId: string, collectionIds: string[]) => Promise<void>;
}

/**
 * Mirrors the main process's collections (source of truth). Every mutation
 * returns the updated row (or the whole list) and is merged back in, so the
 * store never has to guess what the write produced.
 */
export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  loading: true,

  load: async () => {
    try {
      set({ collections: await api().listCollections(), loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  createCollection: async (name) => {
    const created = await api().createCollection(name);
    if (created) set({ collections: [...get().collections, created] });
    return created;
  },

  renameCollection: async (id, name) => {
    const updated = await api().renameCollection(id, name);
    if (updated) set({ collections: get().collections.map((c) => (c.id === id ? updated : c)) });
  },

  removeCollection: async (id) => {
    await api().removeCollection(id);
    set({ collections: get().collections.filter((c) => c.id !== id) });
  },

  addBooksToCollection: async (id, bookIds) => {
    const updated = await api().addBooksToCollection(id, bookIds);
    if (updated) set({ collections: get().collections.map((c) => (c.id === id ? updated : c)) });
  },

  removeBookFromCollection: async (id, bookId) => {
    const updated = await api().removeBookFromCollection(id, bookId);
    if (updated) set({ collections: get().collections.map((c) => (c.id === id ? updated : c)) });
  },

  setCollectionBooks: async (id, bookIds) => {
    const updated = await api().setCollectionBooks(id, bookIds);
    if (updated) set({ collections: get().collections.map((c) => (c.id === id ? updated : c)) });
  },

  setBookCollections: async (bookId, collectionIds) => {
    set({ collections: await api().setBookCollections(bookId, collectionIds) });
  },
}));
