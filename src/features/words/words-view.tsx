import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Download, GraduationCap, Languages, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LibrarySidebar } from "@/features/library/library-sidebar";
import { StatCard } from "@/features/stats/stats-widgets";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useAnkiStore } from "@/stores/anki-store";
import { relativeTime } from "@/lib/format";
import { toCsv, toTsv } from "@/lib/vocab/export";
import { cardDataFromEntry, buildNote } from "@/lib/dictionary/anki-note";
import { cn } from "@/lib/utils";
import { VOCAB_STATES, type VocabEntry, type VocabOccurrence, type VocabState, type VocabStats } from "@/lib/types";

const api = () => window.electronAPI.vocab;

const STATE_LABELS: Record<VocabState, string> = {
  new: "New",
  learning: "Learning",
  known: "Known",
  ignored: "Ignored",
};

const STATE_STYLES: Record<VocabState, string> = {
  new: "text-foreground/70",
  learning: "text-amber-600 dark:text-amber-400",
  known: "text-emerald-600 dark:text-emerald-400",
  ignored: "text-muted-foreground/60 line-through",
};

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

/** The word plus its reading, as the popup showed it. */
function Headword({ entry }: { entry: VocabEntry }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-sm font-medium">{entry.expression}</span>
      {entry.reading && entry.reading !== entry.expression && <span className="text-[11px] text-muted-foreground">{entry.reading}</span>}
    </span>
  );
}

/**
 * The vocabulary page: every word looked up in the reader, what state it is in,
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<VocabEntry | null>(null);
  const [occurrences, setOccurrences] = useState<VocabOccurrence[]>([]);
  const [mining, setMining] = useState(false);

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
  const allSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((row) => row.id)));

  /** Applies a state to the selection, then reloads (the filter may drop rows). */
  const applyState = async (state: VocabState) => {
    const ids = [...selected];
    if (!ids.length) return;
    await api().setStateMany(ids, state);
    setSelected(new Set());
    await refresh();
  };

  const openDetail = async (entry: VocabEntry) => {
    setDetail(entry);
    setOccurrences(await api().occurrences(entry.id));
  };

  const setOneState = async (entry: VocabEntry, state: VocabState) => {
    const updated = await api().setState({ expression: entry.expression, reading: entry.reading, state });
    if (updated) {
      setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setDetail((prev) => (prev && prev.id === updated.id ? updated : prev));
    }
  };

  const removeWord = async (entry: VocabEntry) => {
    await api().remove(entry.id);
    setRows((prev) => prev.filter((row) => row.id !== entry.id));
    setDetail((prev) => (prev?.id === entry.id ? null : prev));
  };

  /** Opens the book at the passage where the word was met. */
  const jumpTo = (occurrence: VocabOccurrence) => {
    const book = books.find((b) => b.id === occurrence.bookId);
    if (!book) return;
    setDetail(null);
    openReader(book, occurrence.charOffset);
  };

  /** Exports the selection when there is one, else everything on screen. */
  const exportRows = async (format: "csv" | "tsv") => {
    const rowsOut = selected.size ? visible.filter((row) => selected.has(row.id)) : visible;
    if (!rowsOut.length) return;
    const result = await api().exportFile(`aozora-words.${format}`, format === "csv" ? toCsv(rowsOut) : toTsv(rowsOut));
    if (result.ok) toast.success(`Exported ${rowsOut.length} words.`);
    else if (!("canceled" in result)) toast.error(result.error);
  };

  /**
   * Mines the selection to Anki. The glossary isn't stored, so each word is
   * looked up again; the sentence and book come from its last occurrence.
   */
  const mineSelection = async () => {
    const cfg = useAnkiStore.getState();
    const targets = visible.filter((row) => selected.has(row.id));
    if (!targets.length) return;

    setMining(true);
    let added = 0;
    const failed: string[] = [];
    try {
      for (const row of targets) {
        const result = await window.electronAPI.dictionary.lookup(row.expression);
        const entry = result?.entries.find((e) => e.expression === row.expression && (e.reading ?? "") === row.reading) ?? result?.entries[0];
        if (!entry) {
          failed.push(row.expression);
          continue;
        }
        const note = buildNote(
          cfg,
          cardDataFromEntry(entry, {
            sentence: row.lastSentence ?? "",
            documentTitle: row.lastBookTitle ?? "",
            documentAuthor: "",
            hasScreenshot: false,
          }),
        );
        const res = await window.electronAPI.anki.addNote({ server: cfg.server, apiKey: cfg.apiKey }, note, null);
        if (res.ok || /duplicate/i.test(res.error)) {
          await api().markMined(row.expression, row.reading);
          added += 1;
        } else {
          failed.push(row.expression);
        }
      }
    } finally {
      setMining(false);
      setSelected(new Set());
      await refresh();
    }
    if (added) toast.success(`Added ${added} card${added === 1 ? "" : "s"} to Anki.`);
    if (failed.length) toast.error(`Skipped ${failed.length}: ${failed.slice(0, 3).join("、")}${failed.length > 3 ? "…" : ""}`);
  };

  const empty = !loading && !rows.length;
  const unfiltered = stateFilter === "all" && bookFilter === "all" && !query;

  return (
    <div className="flex h-full">
      <LibrarySidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
          <header className="space-y-1">
            <h1 className="text-lg font-medium tracking-tight">Words</h1>
            <p className="text-xs text-muted-foreground">
              Every word you looked up while reading, with the sentence it came from. Mark what you know, mine the rest to Anki.
            </p>
          </header>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Languages} label="Words" value={stats?.total ?? 0} sub={`${stats?.lookupCount ?? 0} lookups`} />
            <StatCard icon={Sparkles} label="New today" value={stats?.newToday ?? 0} sub="first met today" />
            <StatCard icon={GraduationCap} label="Learning" value={stats?.byState.learning ?? 0} sub={`${stats?.minedCount ?? 0} in Anki`} />
            <StatCard icon={Check} label="Known" value={stats?.byState.known ?? 0} sub={`${stats?.byState.new ?? 0} still new`} />
          </section>

          {/* Filters. */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a word or reading"
              className="h-8 w-56"
            />
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              size="sm"
              value={stateFilter}
              onValueChange={(v) => v && setStateFilter(v as VocabState | "all")}
            >
              <ToggleGroupItem value="all" className="px-2 text-[11px]">
                All
              </ToggleGroupItem>
              {VOCAB_STATES.map((state) => (
                <ToggleGroupItem key={state} value={state} className="px-2 text-[11px]">
                  {STATE_LABELS[state]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <Select value={bookFilter} onValueChange={setBookFilter}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue placeholder="Any book" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any book</SelectItem>
                {books.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger size="sm" className="w-40">
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

            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => exportRows("csv")} disabled={!visible.length}>
                <Download className="size-3.5" />
                CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportRows("tsv")} disabled={!visible.length}>
                <Download className="size-3.5" />
                TSV
              </Button>
            </div>
          </div>

          {/* Bulk actions, only while something is picked. */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border bg-muted/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {VOCAB_STATES.map((state) => (
                  <Button key={state} size="sm" variant="outline" onClick={() => applyState(state)}>
                    {STATE_LABELS[state]}
                  </Button>
                ))}
                <Button size="sm" variant="outline" onClick={mineSelection} disabled={!ankiReady || mining}>
                  {mining ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Anki
                </Button>
              </div>
            </div>
          )}

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
                  <th className="w-8 px-2 py-2">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="px-2 py-2 font-medium">Word</th>
                  <th className="w-20 px-2 py-2 font-medium">State</th>
                  <th className="w-14 px-2 py-2 text-right font-medium">Seen</th>
                  <th className="w-20 px-2 py-2 font-medium">Last met</th>
                  <th className="px-2 py-2 font-medium">Sentence</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.id} className="group border-b border-border/60 hover:bg-muted/40">
                    <td className="px-2 py-1.5">
                      <Checkbox
                        checked={selected.has(entry.id)}
                        onCheckedChange={() => toggleRow(entry.id)}
                        aria-label={`Select ${entry.expression}`}
                      />
                    </td>
                    <td className="cursor-pointer px-2 py-1.5" onClick={() => void openDetail(entry)}>
                      <Headword entry={entry} />
                      {entry.lastBookTitle && <span className="block max-w-56 truncate text-[10px] text-muted-foreground">{entry.lastBookTitle}</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn("text-[11px]", STATE_STYLES[entry.state])}>{STATE_LABELS[entry.state]}</span>
                      {entry.minedAt && <span className="ml-1 text-[10px] text-muted-foreground">· Anki</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{entry.lookupCount}</td>
                    <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{relativeTime(entry.lastAt)}</td>
                    <td className="max-w-0 px-2 py-1.5">
                      <span className="block truncate text-[11px] text-muted-foreground" title={entry.lastSentence ?? ""}>
                        {entry.lastSentence}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 text-muted-foreground opacity-0 group-hover:opacity-100"
                            aria-label={`Forget ${entry.expression}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Forget “{entry.expression}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This drops the word and its {entry.lookupCount} recorded sighting{entry.lookupCount === 1 ? "" : "s"}. Looking it up
                              again starts a fresh count.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void removeWord(entry)}>Forget</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* One word: its state and every sighting, each a jump back into the book. */}
      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="right" className="w-96 sm:max-w-96">
          <SheetHeader>
            <SheetTitle className="flex items-baseline gap-2">
              {detail?.expression}
              {detail?.reading && detail.reading !== detail.expression && (
                <span className="text-xs font-normal text-muted-foreground">{detail.reading}</span>
              )}
            </SheetTitle>
          </SheetHeader>

          {detail && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                size="sm"
                value={detail.state}
                onValueChange={(v) => v && void setOneState(detail, v as VocabState)}
              >
                {VOCAB_STATES.map((state) => (
                  <ToggleGroupItem key={state} value={state} className="px-2 text-[11px]">
                    {STATE_LABELS[state]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <p className="text-[11px] text-muted-foreground">
                Met {detail.lookupCount}× · first {relativeTime(detail.firstAt)}
                {detail.minedAt ? " · mined to Anki" : ""}
              </p>

              <ul className="space-y-3">
                {occurrences.map((occurrence) => (
                  <li key={occurrence.id} className="space-y-1 border-b border-border/60 pb-3 last:border-0">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{occurrence.bookTitle ?? "Removed book"}</span>
                      <span className="ml-auto shrink-0">{relativeTime(occurrence.createdAt)}</span>
                    </div>
                    {occurrence.sentence && <p className="text-xs leading-relaxed">{occurrence.sentence}</p>}
                    {occurrence.bookId && occurrence.charOffset != null && (
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-[11px]" onClick={() => jumpTo(occurrence)}>
                        <BookOpen className="size-3" />
                        Open here
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
