import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { Slider } from "@/components/ui/slider";
import { chapterIndexAt } from "@/lib/reader/chapters";
import { colorSwatch } from "@/lib/reader/annotations";
import { formatDuration } from "@/lib/stats/aggregate";
import type { Section } from "@/lib/epub/generate-html";
import type { Annotation, Bookmark } from "@/lib/types";
import type { ProgressBarMode } from "@/stores/settings-store";

/** A drop within this fraction of the track snaps to the chapter start (hold Alt to place freely). */
const SNAP_RATIO = 0.012;
/** Auto mode: the pointer this close to the window's bottom edge reveals the bar. */
const REVEAL_PX = 96;
const HIDE_MS = 1600;
const SPEED_POLL_MS = 15_000;
/** How long after a drop the reader's reply still counts as that seek landing. */
const SETTLE_MS = 1200;
/** All-time average is only offered as a speed once there's this much of it. */
const MIN_AVG_MS = 600_000;
const MIN_AVG_CHARS = 2000;

/** True while the seek bar holds keyboard focus, so page-flip key handlers can
 *  stand down and leave the arrows to the slider. */
export function isScrubFocused(): boolean {
  return !!document.activeElement?.closest("[data-aoz-scrub]");
}

interface ReaderProgressProps {
  mode: ProgressBarMode;
  /** Character offset, or the page ordinal for a fixed-layout book. */
  char: number;
  /** Total characters, or the page count for a fixed-layout book. */
  total: number;
  fixedLayout: boolean;
  chapters: Section[];
  bookmarks: Bookmark[];
  annotations: Annotation[];
  /** Page ordinal + count, for fixed-layout books; reflowable pages are per
   *  section, which says nothing about where you are in the book. */
  pageInfo: { page: number; totalPages: number } | null;
  /** Books that read right to left (tategaki, RTL manga): the track runs the same way. */
  inverted: boolean;
  speed: () => number | null;
  onSeek: (char: number) => void;
}

/**
 * The reader's bottom seek bar: position, chapter, and a scrub handle.
 *
 * Runs on the reader's character-offset model, so one bar serves continuous,
 * paginated and fixed-layout books (there `char` is a page ordinal, and the last
 * page is 100%). Dragging only previews: the seek fires on release, because a
 * paginated jump re-lays-out a whole section and can't follow the pointer.
 */
export function ReaderProgress({
  mode,
  char,
  total,
  fixedLayout,
  chapters,
  bookmarks,
  annotations,
  pageInfo,
  inverted,
  speed,
  onSeek,
}: ReaderProgressProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const altRef = useRef(false);
  const holdRef = useRef(false); // dragging, hovering or focused: don't auto-hide
  const settleUntilRef = useRef(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(true);
  const [liveCpm, setLiveCpm] = useState<number | null>(null);
  const [avgCpm, setAvgCpm] = useState<number | null>(null);

  // A fixed-layout book is read out, so its last page (total - 1) is 100%.
  const max = Math.max(1, fixedLayout && total > 1 ? total - 1 : total);
  const display = Math.min(max, scrub ?? char);
  const pct = Math.round((display / max) * 100);
  // Chapter offsets are character counts, which image-only pages don't have.
  const marked = !fixedLayout && !!chapters.length;

  // Track coordinates run backwards for right-to-left books; the mapping is its
  // own inverse, so one helper covers both directions.
  const flip = useCallback((ratio: number) => (inverted ? 1 - ratio : ratio), [inverted]);

  // A seek reports back the start of the page (continuous: the paragraph) it
  // landed in, which is a little behind where the handle was dropped. Keep
  // showing the drop through that reply, and hand the handle back to the reader
  // on the next move, so it never steps backwards on its own.
  useEffect(() => {
    if (draggingRef.current || Date.now() < settleUntilRef.current) return;
    setScrub(null);
  }, [char]);

  // Auto mode: the bar overlays the page and stays out of the way until the
  // pointer comes down to it.
  useEffect(() => {
    if (mode !== "auto") return;
    let timer: ReturnType<typeof setTimeout>;
    const hideSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!holdRef.current) setRevealed(false);
      }, HIDE_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (e.clientY >= window.innerHeight - REVEAL_PX) {
        clearTimeout(timer);
        setRevealed(true);
      } else {
        hideSoon();
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    hideSoon();
    return () => {
      window.removeEventListener("pointermove", onMove);
      clearTimeout(timer);
    };
  }, [mode]);

  // Reading speed for the estimate: the live session when it's long enough to
  // trust, else the all-time average. Characters only, so manga has neither.
  useEffect(() => {
    if (fixedLayout) return;
    const id = setInterval(() => setLiveCpm(speed()), SPEED_POLL_MS);
    return () => clearInterval(id);
  }, [speed, fixedLayout]);

  useEffect(() => {
    if (fixedLayout) return;
    let cancelled = false;
    window.electronAPI.stats
      .get()
      .then(({ overview }) => {
        if (cancelled) return;
        const usable = overview.totalMs >= MIN_AVG_MS && overview.totalChars >= MIN_AVG_CHARS;
        setAvgCpm(usable ? overview.totalChars / (overview.totalMs / 60_000) : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fixedLayout]);

  const notches = useMemo(() => {
    if (!marked) return [];
    return chapters.map((c) => (c.startCharacter ?? 0) / max).filter((r) => r > 0.005 && r < 0.995);
  }, [chapters, max, marked]);

  const marks = useMemo(() => {
    if (!marked) return [];
    return [
      ...bookmarks.map((b) => ({ key: `b:${b.id}`, ratio: b.charOffset / max, color: null as string | null })),
      ...annotations.map((a) => ({ key: `a:${a.id}`, ratio: a.startChar / max, color: colorSwatch(a.color) })),
    ].filter((m) => m.ratio >= 0 && m.ratio <= 1);
  }, [bookmarks, annotations, max, marked]);

  const labelAt = useCallback(
    (value: number) => {
      const i = chapterIndexAt(chapters, value);
      return i >= 0 ? chapters[i].label || "" : "";
    },
    [chapters],
  );

  const snap = useCallback(
    (value: number) => {
      if (altRef.current || !marked) return value;
      const tolerance = max * SNAP_RATIO;
      let best = value;
      let closest = tolerance;
      for (const c of chapters) {
        const start = c.startCharacter ?? 0;
        const d = Math.abs(start - value);
        if (d < closest) {
          closest = d;
          best = start;
        }
      }
      return Math.round(best);
    },
    [chapters, max, marked],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    altRef.current = e.altKey;
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    setHoverRatio(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };

  if (mode === "off" || !total) return null;

  const tipRatio = scrub != null && draggingRef.current ? flip(display / max) : hoverRatio;
  const tipChar = scrub != null && draggingRef.current ? display : hoverRatio != null ? flip(hoverRatio) * max : null;
  const tipLabel = tipChar == null ? "" : labelAt(tipChar);
  const width = barRef.current?.clientWidth ?? 0;
  // Keep the bubble inside the track rather than letting it hang off an edge.
  const tipLeft = tipRatio == null ? 0 : Math.min(Math.max(tipRatio * width, 56), Math.max(width - 56, 56));

  const cpm = liveCpm ?? avgCpm;
  const remaining = cpm && cpm > 0 && display < max ? formatDuration(((max - display) / cpm) * 60_000) : null;

  const body = (
    <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-muted-foreground">
      <span className="w-40 shrink-0 truncate" title={labelAt(display)}>
        {labelAt(display)}
      </span>

      <div
        ref={barRef}
        data-aoz-scrub
        className="relative h-4 flex-1 cursor-pointer"
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          if (draggingRef.current) return;
          holdRef.current = false;
          setHoverRatio(null);
        }}
        onPointerEnter={() => (holdRef.current = true)}
        onPointerUp={() => {
          // Hand the arrow keys back to page flipping: the slider keeps them only
          // when it was tabbed to, not after a click on the track.
          const active = document.activeElement;
          if (active instanceof HTMLElement && barRef.current?.contains(active)) active.blur();
        }}
        onFocusCapture={() => (holdRef.current = true)}
        onBlurCapture={() => (holdRef.current = false)}
      >
        <Slider
          aria-label="Reading position"
          className="absolute inset-x-0 top-1"
          value={[display]}
          min={0}
          max={max}
          step={Math.max(1, Math.round(max / 1000))}
          inverted={inverted}
          onValueChange={([v]) => {
            draggingRef.current = true;
            holdRef.current = true;
            setScrub(snap(v)); // magnetic while dragging, so the drop holds no surprise
          }}
          onValueCommit={([v]) => {
            draggingRef.current = false;
            holdRef.current = false;
            const target = snap(v);
            settleUntilRef.current = Date.now() + SETTLE_MS;
            setScrub(target);
            setHoverRatio(null);
            onSeek(target);
          }}
        />

        <div className="pointer-events-none absolute inset-0">
          {notches.map((ratio, i) => (
            <span key={`${i}:${ratio}`} className="absolute top-1 h-1 w-px bg-background" style={{ left: `${flip(ratio) * 100}%` }} />
          ))}
          {marks.map((m) => (
            <span
              key={m.key}
              className={cn("absolute top-2.5 h-1 w-0.5", !m.color && "bg-foreground/45")}
              style={{ left: `${flip(m.ratio) * 100}%`, backgroundColor: m.color ?? undefined }}
            />
          ))}
        </div>

        {tipRatio != null && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-2 max-w-64 -translate-x-1/2 truncate border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md"
            style={{ left: tipLeft }}
          >
            {tipLabel && <span className="mr-1.5">{tipLabel}</span>}
            <span className="tabular-nums opacity-70">{Math.round(((tipChar ?? 0) / max) * 100)}%</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 tabular-nums">
        {pageInfo && (
          <span>
            {pageInfo.page + 1}
            <span className="opacity-50">/{pageInfo.totalPages}</span>
          </span>
        )}
        <span className="w-8 text-right">{pct}%</span>
        {remaining && <span className="w-16 text-right opacity-70">{remaining} left</span>}
      </div>
    </div>
  );

  if (mode === "always") return <footer className="shrink-0 border-t bg-background">{body}</footer>;

  return (
    <>
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur transition-transform duration-200",
          revealed ? "translate-y-0" : "translate-y-full",
        )}
      >
        {body}
      </div>
      {!revealed && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-0.5 bg-muted">
          <div className="h-full bg-muted-foreground/60" style={{ width: `${pct}%`, marginLeft: inverted ? "auto" : undefined }} />
        </div>
      )}
    </>
  );
}
