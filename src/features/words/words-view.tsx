import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheck, GraduationCap, Languages, Loader2, MoreVertical, Search, Astroid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LibrarySidebar } from "@/features/library/library-sidebar";
import { StatCard } from "@/features/stats/stats-widgets";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useAnkiStore } from "@/stores/anki-store";
import { relativeTime } from "@/lib/format";
import { cn } from "cn";
import { VOCAB_STATES, type VocabEntry, type VocabOccurrence, type VocabState, type VocabStats } from "@/lib/types";
import { STATE_LABELS, STATE_STYLES } from "./word-states";
import { BookCover, Headword, MarkedSentence } from "./word-bits";
import { BookPicker } from "./book-picker";
import { WordActionsMenu, WordContextMenu, type WordActions } from "./word-menu";
import { WordSheet } from "./word-sheet";
import { LookupPanel } from "./lookup-panel";
import { mineWord } from "./mine-word";

const api = () => window.electronAPI.vocab;

type SortKey = "lastSeen" | "lookups" | "firstSeen" | "alpha";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "lastSeen", label: "Last met" },
  { value: "lookups", label: "Most looked up" },
  { value: "firstSeen", label: "First met" },
  { value: "alpha", label: "Alphabetical" },
];

/** Pure sort over a copy; never returned straight from a Zustand selector. */
function sortWords(rows: VocabEntry[], sort: SortKey): VocabEntry[] {
  const arr = [...rows];
  switch (sort) {
    case "lookups":
      return arr.sort((a, b) => b.lookupCount - a.lookupCount || b.lastAt - a.lastAt);
    case "firstSeen":
      return arr.sort((a, b) => b.firstAt - a.firstAt);
    case "alpha":
      return arr.sort((a, b) => a.expression.localeCompare(b.expression, "ja"));
    default:
      return arr.sort((a, b) => b.lastAt - a.lastAt);
  }
}

/**
 * The vocabulary page: every word looked up while reading, what state it is in,
 * and where it was met. Capture happens in the reader (see use-hover-dictionary);
 * this view curates the result and feeds Anki.
 */
export function WordsView() {
  const books = useLibraryStore((s) => s.books);
  const loadBooks = useLibraryStore((s) => s.loadBooks);
  const openReader = useReaderStore((s) => s.open);

  const [rows, setRows] = useState<VocabEntry[]>([]);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<VocabState | "all">("all");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("lastSeen");
  const [detail, setDetail] = useState<VocabEntry | null>(null);
  const [occurrences, setOccurrences] = useState<VocabOccurrence[]>([]);
  const [miningId, setMiningId] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState<VocabEntry | null>(null);
  // The lookup popup: the word it opens on, and the button it hangs off.
  const [lookup, setLookup] = useState<{ open: boolean; word: string; anchor: HTMLElement | null }>({ open: false, word: "", anchor: null });

  const ankiReady = useAnkiStore((s) => s.enabled && !!s.deck && !!s.model);

  useEffect(() => {
    if (!books.length) void loadBooks();
  }, [books.length, loadBooks]);

  // Typing shouldn't fire a query per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([
        api().list({ state: stateFilter, bookId: bookFilter === "all" ? null : bookFilter, search: query }),
        api().stats(),
      ]);
      setRows(list);
      setStats(summary);
    } finally {
      setLoading(false);
    }
  }, [stateFilter, bookFilter, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => sortWords(rows, sort), [rows, sort]);
  const booksById = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);

  const openDetail = async (entry: VocabEntry) => {
    setDetail(entry);
    setOccurrences(await api().occurrences(entry.id));
  };

  const setOneState = async (entry: VocabEntry, state: VocabState) => {
    const updated = await api().setState({ expression: entry.expression, reading: entry.reading, state });
    if (!updated) return;
    setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    setDetail((prev) => (prev && prev.id === updated.id ? updated : prev));
    setStats(await api().stats());
  };

  const removeWord = async (entry: VocabEntry) => {
    await api().remove(entry.id);
    setRows((prev) => prev.filter((row) => row.id !== entry.id));
    setDetail((prev) => (prev?.id === entry.id ? null : prev));
    setStats(await api().stats());
  };

  /** Opens the book at the passage where the word was met. */
  const jumpTo = (occurrence: VocabOccurrence) => {
    const book = books.find((b) => b.id === occurrence.bookId);
    if (!book) return;
    setDetail(null);
    openReader(book, occurrence.charOffset);
  };

  const mineOne = async (entry: VocabEntry) => {
    setMiningId(entry.id);
    try {
      await mineWord(entry);
    } finally {
      setMiningId(null);
      await refresh();
    }
  };

  const lookUp = (word: string, anchor: HTMLElement) => setLookup({ open: true, word, anchor });

  const wordActions: WordActions = {
    onDetails: (entry) => void openDetail(entry),
    onSetState: (entry, state) => void setOneState(entry, state),
    onMine: (entry) => void mineOne(entry),
    onDelete: setConfirmForget,
    miningId,
    ankiReady,
  };

  const empty = !loading && !rows.length;
  const unfiltered = stateFilter === "all" && bookFilter === "all" && !query;

  return (
    <div className="flex h-full">
      <LibrarySidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="space-y-6 p-6">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Languages} label="Words" value={stats?.total ?? 0} sub={`${stats?.lookupCount ?? 0} lookups`} />
            <StatCard icon={Astroid} label="New today" value={stats?.newToday ?? 0} sub="first met today" />
            <StatCard icon={GraduationCap} label="Learning" value={stats?.byState.learning ?? 0} sub={`${stats?.minedCount ?? 0} in Anki`} />
            <StatCard icon={CircleCheck} label="Known" value={stats?.byState.known ?? 0} sub={`${stats?.byState.new ?? 0} still new`} />
          </section>

          <div className="space-y-3">
            <div className="flex w-full flex-wrap items-center gap-2">
              <div className="relative w-56 shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a word or reading" className="pr-7 pl-8" />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Tabs value={stateFilter} onValueChange={(v) => setStateFilter(v as VocabState | "all")}>
                <TabsList>
                  <TabsTrigger value="all" className="px-3">
                    All
                  </TabsTrigger>
                  {VOCAB_STATES.map((state) => (
                    <TabsTrigger key={state} value={state} className="px-3">
                      {STATE_LABELS[state]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="ml-auto flex items-center gap-1">
                <BookPicker books={books} value={bookFilter} onChange={setBookFilter} />

                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger size="default" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button onClick={(e) => lookUp("", e.currentTarget)}>
                  <Search className="size-4" />
                  Look up
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : empty ? (
              <div className="flex flex-col items-center gap-3 border-2 border-dashed border-border px-8 py-12 text-center">
                <Languages className="size-10 text-muted-foreground" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{unfiltered ? "No words yet" : "No words match your filters"}</p>
                  <p className="text-xs text-muted-foreground">
                    {unfiltered
                      ? "Look a word up in the reader (hold the trigger key and hover) and it lands here."
                      : "Try another state, book, or search."}
                  </p>
                </div>
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    <th className="w-44 px-2 py-2 font-medium">Word</th>
                    <th className="w-20 px-2 py-2 font-medium">State</th>
                    <th className="w-14 px-2 py-2 text-right font-medium">Met</th>
                    <th className="w-24 px-2 py-2 font-medium">Last met</th>
                    <th className="w-14 px-2 py-2 font-medium">Book</th>
                    <th className="px-2 py-2 font-medium">Sentence</th>
                    <th className="w-12 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => {
                    const lastBook = entry.lastBookId ? booksById.get(entry.lastBookId) : undefined;
                    return (
                      <WordContextMenu key={entry.id} entry={entry} actions={wordActions}>
                        <tr
                          className="group cursor-pointer border-b border-border/60 align-top hover:bg-muted/40"
                          onClick={() => void openDetail(entry)}
                        >
                          <td className="px-2 py-2">
                            <Headword entry={entry} onLookUp={(anchor) => lookUp(entry.expression, anchor)} />
                          </td>
                          <td className="px-2 py-2">
                            <span className={cn("text-[11px]", STATE_STYLES[entry.state])}>{STATE_LABELS[entry.state]}</span>
                            {entry.minedAt && <span className="ml-1 text-[10px] text-muted-foreground">· Anki</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{entry.lookupCount}</td>
                          <td className="px-2 py-2 text-[11px] text-muted-foreground">{relativeTime(entry.lastAt)}</td>
                          <td className="px-2 py-2">{lastBook && <BookCover book={lastBook} className="h-10 w-7" />}</td>
                          <td className="px-2 py-2">
                            {entry.lastSentence && (
                              <MarkedSentence
                                sentence={entry.lastSentence}
                                terms={[entry.lastSurface, entry.expression, entry.reading]}
                                className="block text-[11px] leading-relaxed text-muted-foreground"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                            <WordActionsMenu
                              entry={entry}
                              actions={wordActions}
                              trigger={
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Actions for ${entry.expression}`}
                                  className="text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                                >
                                  <MoreVertical className="size-4" />
                                </Button>
                              }
                            />
                          </td>
                        </tr>
                      </WordContextMenu>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <WordSheet
        entry={detail}
        occurrences={occurrences}
        onClose={() => setDetail(null)}
        onSetState={(entry, state) => void setOneState(entry, state)}
        onJump={jumpTo}
        onLookUp={(entry, anchor) => lookUp(entry.expression, anchor)}
        onMine={(entry) => void mineOne(entry)}
        onForget={setConfirmForget}
        mining={!!miningId}
        ankiReady={ankiReady}
      />

      <LookupPanel
        open={lookup.open}
        initialQuery={lookup.word}
        anchor={lookup.anchor}
        onOpenChange={(open) => setLookup((prev) => ({ ...prev, open }))}
      />

      <AlertDialog open={!!confirmForget} onOpenChange={(open) => !open && setConfirmForget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmForget?.expression}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This drops the word and its {confirmForget?.lookupCount} recorded sighting{confirmForget?.lookupCount === 1 ? "" : "s"}. Looking it up
              again starts a fresh count.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmForget && void removeWord(confirmForget)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
