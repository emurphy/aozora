import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TitleBar } from "@/components/title-bar";
import { ErrorBoundary } from "@/components/error-boundary";
import { LibraryView } from "@/features/library/library-view";
import { CollectionsView } from "@/features/library/collections-view";
import { ReaderView } from "@/features/reader/reader-view";
import { StatsView } from "@/features/stats/stats-view";
import { WordsView } from "@/features/words/words-view";
import { DictionariesView } from "@/features/dictionaries/dictionaries-view";
import { SettingsView } from "@/features/settings/settings-view";
import { importAndOpen } from "@/features/library/import-and-open";
import { useReaderStore } from "@/stores/reader-store";
import { useLibraryStore } from "@/stores/library-store";
import { useUiStore } from "@/stores/ui-store";
import { useSettingsStore, THEMES } from "@/stores/settings-store";
import { useFontsStore } from "@/stores/fonts-store";
import { useDictionaryImportStore } from "@/stores/dictionary-import-store";
import { useCollectionsStore } from "@/stores/collections-store";
import { syncDictionaryStyles } from "@/lib/dictionary/dict-styles";

export function App() {
  const reading = useReaderStore((s) => s.currentBook !== null);
  const view = useUiStore((s) => s.view);
  const fullscreen = useUiStore((s) => s.fullscreen);
  const theme = useSettingsStore((s) => s.theme);
  const discordRichPresence = useSettingsStore((s) => s.discordRichPresence);

  // Mirror the native window's fullscreen state so the title bar can hide and the
  // reader's toggle can reflect it (source of truth is the main process).
  useEffect(() => {
    const api = window.electronAPI?.window;
    if (!api) return;
    const setFullscreen = useUiStore.getState().setFullscreen;
    api.isFullscreen().then(setFullscreen);
    return api.onFullscreenChanged(setFullscreen);
  }, []);

  // macOS menu bar: File → Open… imports through the same picker as the library's
  // Import button; Settings… (⌘,) jumps to settings. Settings leaves the reader
  // first, since the page doesn't show over it.
  useEffect(() => {
    const api = window.electronAPI?.window;
    if (!api) return;
    return api.onMenuCommand((command) => {
      if (command === "settings") {
        useReaderStore.getState().close();
        useUiStore.getState().setView("settings");
      } else {
        void importAndOpen(() => useLibraryStore.getState().importBooks());
      }
    });
  }, []);

  // Books macOS opened with the app (Finder double-click / Open With / Dock drop).
  useEffect(() => {
    const api = window.electronAPI?.library;
    if (!api) return;
    return api.onOpenFiles((files) => void importAndOpen(() => useLibraryStore.getState().importFiles(files)));
  }, []);

  // The sidebar shows collections on every page, so mirror them once here rather
  // than per view.
  useEffect(() => {
    void useCollectionsStore.getState().load().catch(() => {});
  }, []);

  // Load user-imported fonts (IndexedDB) and register their FontFaces once.
  useEffect(() => {
    useFontsStore.getState().init();
  }, []);

  // Inject imported dictionaries' custom CSS (styles.css), scoped per dictionary,
  // so rich glosses (e.g. Jitendex) render styled in the reader popup.
  useEffect(() => {
    void syncDictionaryStyles();
  }, []);

  // Mirror dictionary-import progress into a store at the app level, so the
  // status survives navigating between views (the import itself runs in the
  // main process) and any view / the title bar can show it.
  useEffect(() => {
    const api = window.electronAPI?.dictionary;
    if (!api) return;
    return api.onImportProgress((p) => useDictionaryImportStore.getState().applyProgress(p));
  }, []);

  // Connect/disconnect Discord Rich Presence with the setting. Done here (not in
  // the reader) so it's live regardless of which view is open.
  useEffect(() => {
    window.electronAPI.discord.setEnabled(discordRichPresence);
  }, [discordRichPresence]);

  // Show the idle presence whenever no book is open; the reader owns the
  // reading presence while it's mounted.
  useEffect(() => {
    if (discordRichPresence && !reading) window.electronAPI.discord.clear();
  }, [discordRichPresence, reading]);

  // Toggle the `.dark` class on the document root to swap the Tailwind palette
  // in index.css per the selected theme.
  useEffect(() => {
    const isDark = (THEMES[theme] || THEMES.sepia).dark;
    document.documentElement.classList.toggle("dark", isDark);
  }, [theme]);

  // Dropping a file anywhere outside an explicit drop zone makes Chromium
  // navigate the window to file://… and blow away the app. Swallow those.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col">
      {!fullscreen && <TitleBar />}
      <main className="flex-1 overflow-hidden">
        {/* Scoped inside <main> so a reader crash leaves the title bar usable and
            offers a way back to the library, rather than a blank window. */}
        <ErrorBoundary
          resetKey={reading ? "reader" : view}
          onReset={reading ? () => useReaderStore.getState().close() : undefined}
          resetLabel="Back to library"
        >
          {reading ? (
            <ReaderView />
          ) : view === "collections" ? (
            <CollectionsView />
          ) : view === "stats" ? (
            <StatsView />
          ) : view === "words" ? (
            <WordsView />
          ) : view === "dictionaries" ? (
            <DictionariesView />
          ) : view === "settings" ? (
            <SettingsView />
          ) : (
            <LibraryView />
          )}
        </ErrorBoundary>
      </main>
      <Toaster />
    </div>
  );
}
