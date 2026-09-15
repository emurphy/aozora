import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookCheck, CalendarDays, Clock, Flame, Gauge, Languages, Loader2, Search, Type } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LibrarySidebar } from "@/features/library/library-sidebar";
import { BookCard } from "@/features/library/book-card";
import { useLibraryStore } from "@/stores/library-store";
import { useReaderStore } from "@/stores/reader-store";
import { useStatsPrefs } from "@/stores/stats-prefs-store";
import { readingStatus } from "@/lib/format";
import { toDayKey, shiftDay, computeStreaks, formatDuration, formatCompact } from "@/lib/stats/aggregate";
import type { DayValue } from "@/lib/stats/aggregate";
import type { Stats, VocabStats } from "@/lib/types";
import { Heatmap, HeatmapLegend } from "./heatmap";
import { StatsBarChart } from "./charts";
import type { ChartPoint } from "./charts";
import { StatCard } from "./stats-widgets";
import { GoalCard } from "./goal-card";
import { Milestones } from "./milestones";

const api = () => window.electronAPI.stats;

/**
 * The reading-statistics page. Aggregation runs in SQLite; this component
 * fetches it, derives streaks / heatmap geometry, and lays out the (mostly
 * presentational) section components.
 */
export function StatsView() {
  const books = useLibraryStore((s) => s.books);
  const openReader = useReaderStore((s) => s.open);
  const dailyGoal = useStatsPrefs((s) => s.dailyGoal);
  const setDailyGoal = useStatsPrefs((s) => s.setDailyGoal);
  const [data, setData] = useState<Stats | null>(null);
  const [vocab, setVocab] = useState<VocabStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState("chars"); // chars | minutes
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api()
      .get()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    window.electronAPI.vocab
      .stats()
      .then((v) => {
        if (!cancelled) setVocab(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const daily = data?.daily ?? [];
  const overview = data?.overview ?? { totalChars: 0, totalMs: 0, sessionCount: 0, activeDays: 0 };
  const todayKey = toDayKey(new Date());

  const valueByDay = useMemo(() => {
    const m = new Map<string, DayValue>();
    for (const d of daily) m.set(d.day, { chars: d.chars || 0, ms: d.ms || 0, sessions: d.sessions || 0, books: d.books || 0 });
    return m;
  }, [daily]);

  const streaks = useMemo(
    () =>
      computeStreaks(
        daily.map((d) => d.day),
        todayKey,
      ),
    [daily, todayKey],
  );

  // Years present in the data, newest first; the current year is always offered.
  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()]);
    for (const d of daily) set.add(Number(d.day.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [daily]);

  // The plotted number and the y-axis unit both follow the metric toggle; the
  // tooltip always shows both, so switching never hides a figure.
  const readingRows = (chars: number, ms: number) => [
    { label: "Characters", value: formatCompact(chars) },
    { label: "Time", value: formatDuration(ms) },
  ];
  const metricValue = (chars: number, ms: number) => (metric === "minutes" ? ms / 60000 : chars);
  const metricAxis = (v: number) => (metric === "minutes" ? `${Math.round(v)}m` : formatCompact(v));

  // Last 30 days, gaps filled with zero: the daily-rhythm chart and its header total.
  const trend = useMemo(() => {
    const points: ChartPoint[] = [];
    let chars = 0;
    let ms = 0;
    for (let i = 29; i >= 0; i -= 1) {
      const key = shiftDay(todayKey, -i);
      const v = valueByDay.get(key);
      chars += v?.chars || 0;
      ms += v?.ms || 0;
      points.push({
        key,
        label: key.slice(5).replace("-", "/"),
        title: key === todayKey ? "Today" : key,
        value: metricValue(v?.chars || 0, v?.ms || 0),
        rows: readingRows(v?.chars || 0, v?.ms || 0),
      });
    }
    return { points, total: metric === "minutes" ? formatDuration(ms) : `${formatCompact(chars)} chars` };
  }, [valueByDay, todayKey, metric]);

  // 24 hour-of-day buckets.
  const hourly = useMemo<ChartPoint[]>(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, chars: 0, ms: 0 }));
    for (const h of data?.hourly ?? []) {
      const b = buckets[h.hour];
      if (b) {
        b.chars = h.chars || 0;
        b.ms = h.ms || 0;
      }
    }
    return buckets.map((b) => {
      const hh = String(b.hour).padStart(2, "0");
      return { key: hh, label: hh, title: `${hh}:00`, value: metricValue(b.chars, b.ms), rows: readingRows(b.chars, b.ms) };
    });
  }, [data, metric]);

  const peakHour = useMemo(() => {
    const best = hourly.reduce((top, b) => (b.value > top.value ? b : top), hourly[0]);
    return best && best.value > 0 ? `Peak ${best.title}` : "";
  }, [hourly]);

  // Join each per-book stat to its library Book; drop stats whose book is gone
  // so we only render real covers.
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const topBooks = useMemo(
    () =>
      (data?.perBook ?? [])
        .flatMap((stat) => {
          const book = booksById.get(stat.bookId);
          return book ? [{ stat, book }] : [];
        })
        .slice(0, 12),
    [data, booksById],
  );

  const booksFinished = useMemo(() => books.filter((b) => readingStatus(b) === "finished").length, [books]);

  // Vocabulary: words first met per day over the same 30-day window as the
  // reading trend, plus how often a lookup was needed per 1000 characters read.
  const wordsByDay = useMemo(() => new Map((vocab?.daily ?? []).map((d) => [d.day, d.words])), [vocab]);
  const wordsTrend = useMemo<ChartPoint[]>(() => {
    const arr: ChartPoint[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const key = shiftDay(todayKey, -i);
      const value = wordsByDay.get(key) || 0;
      arr.push({
        key,
        label: key.slice(5).replace("-", "/"),
        title: key === todayKey ? "Today" : key,
        value,
        rows: [{ label: "New words", value: String(value) }],
      });
    }
    return arr;
  }, [wordsByDay, todayKey]);
  const newWordsThisWeek = useMemo(() => wordsTrend.slice(-7).reduce((sum, day) => sum + day.value, 0), [wordsTrend]);
  const newWordsThisMonth = useMemo(() => wordsTrend.reduce((sum, day) => sum + day.value, 0), [wordsTrend]);
  const lookupsPerThousand = overview.totalChars > 0 ? ((vocab?.lookupCount ?? 0) / overview.totalChars) * 1000 : 0;

  const speedCpm = overview.totalMs > 0 ? Math.round(overview.totalChars / (overview.totalMs / 60000)) : 0;
  const hasData = overview.sessionCount > 0;
  const selected = selectedDay ? valueByDay.get(selectedDay) : null;

  // Daily goal: today's characters vs the target, plus the run of consecutive
  // goal-meeting days (reuses the streak calc over the days that met the goal).
  const todayChars = valueByDay.get(todayKey)?.chars || 0;
  const goalPct = dailyGoal > 0 ? todayChars / dailyGoal : 0;
  const goalStreak = useMemo(() => {
    if (dailyGoal <= 0) return { current: 0, longest: 0 };
    return computeStreaks(
      daily.filter((d) => (d.chars || 0) >= dailyGoal).map((d) => d.day),
      todayKey,
    );
  }, [daily, dailyGoal, todayKey]);

  return (
    <div className="flex h-full">
      <LibrarySidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="flex w-full max-w-sm flex-col items-center gap-3 border-2 border-dashed border-border px-8 py-12 text-center">
              <BarChart3 className="size-10 text-muted-foreground" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="text-sm font-medium">No reading recorded yet</p>
                <p className="text-xs text-muted-foreground">Open a book and start reading; your activity will show up here.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-8 overflow-auto p-6">
            {/* Headline totals. */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <StatCard icon={Type} label="Characters" value={formatCompact(overview.totalChars)} sub={`${overview.sessionCount} sessions`} />
              <StatCard icon={Clock} label="Time read" value={formatDuration(overview.totalMs)} sub={`${overview.activeDays} active days`} />
              <StatCard icon={Gauge} label="Speed" value={formatCompact(speedCpm)} sub="chars / min" />
              <StatCard icon={CalendarDays} label="Active days" value={overview.activeDays} sub="all time" />
              <StatCard icon={Flame} label="Streak" value={`${streaks.current}d`} sub={`Longest ${streaks.longest}d`} />
              <StatCard icon={BookCheck} label="Finished" value={booksFinished} sub="books" />
            </section>

            {/* Daily goal + Activity side by side on wide screens. */}
            <section className="grid gap-x-6 gap-y-6 lg:grid-cols-3">
              <GoalCard dailyGoal={dailyGoal} setDailyGoal={setDailyGoal} todayChars={todayChars} goalPct={goalPct} goalStreak={goalStreak} />

              {/* Activity heatmap. */}
              <div className="space-y-3 lg:col-span-2">
                <div className="flex min-h-7 flex-wrap items-center gap-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity</h2>
                  <div className="ml-auto flex items-center gap-2">
                    <Tabs value={metric} onValueChange={setMetric}>
                      {/* h-7! to sit level with the year Select: the list's own h-8 comes from a
                          group-data variant, which outranks a plain utility class. */}
                      <TabsList className="h-7!">
                        <TabsTrigger value="chars" className="px-2.5 text-[11px]">
                          Chars
                        </TabsTrigger>
                        <TabsTrigger value="minutes" className="px-2.5 text-[11px]">
                          Minutes
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                      <SelectTrigger size="sm" className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Card size="sm" className="gap-3">
                  <div className="px-3 pt-1">
                    <Heatmap
                      year={year}
                      valueByDay={valueByDay}
                      metric={metric}
                      goalChars={dailyGoal}
                      selectedDay={selectedDay}
                      onSelectDay={setSelectedDay}
                    />
                  </div>
                  <div className="flex items-center justify-between px-3">
                    <p className="text-[11px] text-muted-foreground">
                      {selected
                        ? `${selectedDay} · ${formatCompact(selected.chars || 0)} chars · ${formatDuration(selected.ms || 0)} · ${selected.sessions} session${selected.sessions === 1 ? "" : "s"}`
                        : "Click a day for details"}
                    </p>
                    <HeatmapLegend />
                  </div>
                </Card>
              </div>
            </section>

            {/* Daily + hourly rhythm. */}
            <section className="grid gap-3 lg:grid-cols-2">
              {/* min-w-0: a grid item defaults to min-content, which would stop the chart shrinking. */}
              <Card size="sm" className="min-w-0 gap-3">
                <div className="flex items-baseline justify-between gap-2 px-3 pt-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last 30 days</h3>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{trend.total}</span>
                </div>
                <div className="px-3">
                  <StatsBarChart data={trend.points} valueFormat={metricAxis} tickInterval={6} />
                </div>
              </Card>

              <Card size="sm" className="min-w-0 gap-3">
                <div className="flex items-baseline justify-between gap-2 px-3 pt-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By hour of day</h3>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{peakHour}</span>
                </div>
                <div className="px-3">
                  <StatsBarChart data={hourly} valueFormat={metricAxis} tickInterval={5} />
                </div>
              </Card>
            </section>

            {/* Vocabulary: the words looked up while reading (curated on the Words page). */}
            {vocab && vocab.total > 0 && (
              <section className="grid gap-3 lg:grid-cols-3">
                <Card size="sm" className="min-w-0 gap-3 lg:col-span-2">
                  <div className="flex items-baseline justify-between gap-2 px-3 pt-1">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New words, last 30 days</h3>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{newWordsThisMonth} words</span>
                  </div>
                  <div className="px-3">
                    <StatsBarChart data={wordsTrend} valueFormat={(v) => String(Math.round(v))} tickInterval={6} color="var(--chart-4)" />
                  </div>
                </Card>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                  <StatCard icon={Languages} label="New this week" value={newWordsThisWeek} sub={`${vocab.total} words all time`} />
                  <StatCard
                    icon={Search}
                    label="Lookup rate"
                    value={lookupsPerThousand ? lookupsPerThousand.toFixed(1) : "0"}
                    sub="lookups / 1k chars"
                  />
                </div>
              </section>
            )}

            <Milestones
              totalChars={overview.totalChars}
              activeDays={overview.activeDays}
              bestStreak={streaks.longest}
              booksFinished={booksFinished}
            />

            {/* Most-read books, ranked by time read and shown as library cards. */}
            {topBooks.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Most-read books</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-6">
                  {topBooks.map(({ stat, book }) => (
                    <div key={stat.bookId} className="space-y-1">
                      <BookCard book={book} onOpen={openReader} />
                      <div className="flex justify-between text-[10px] text-muted-foreground/80 tabular-nums">
                        <p>{formatDuration(stat.ms || 0)}</p>
                        <p>{formatCompact(stat.chars || 0)} chars</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
