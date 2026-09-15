import { useRef } from "react";
import type { DictionaryEntry, KanjiEntry, LookupResult } from "@/lib/types";
import type { MineStatus } from "@/lib/dictionary/anki-note";
import { useAnchoredPosition } from "./hooks/use-anchored-position";
import { DictionaryResult } from "./dictionary-result";

/**
 * Floating Yomitan-style dictionary popup: places DictionaryResult below the
 * matched run's box (flipping above / clamping to the viewport on overflow).
 * Renders null with no result, so the reader can keep it mounted and just feed
 * it state.
 */

interface Props {
  result: LookupResult | null;
  /** Bounding box of the matched run, in viewport coordinates. */
  anchor: DOMRect | null;
  /** Cursor entered the popup (the reader keeps it alive so its content can be scrolled). */
  onMouseEnter?: () => void;
  /** Cursor left the popup (the reader schedules its dismissal). */
  onMouseLeave?: () => void;
  /** Reports the popup's final viewport box after each placement (for the sticky zone). */
  onLayout?: (rect: { left: number; top: number; right: number; bottom: number }) => void;
  onMine?: (entry: DictionaryEntry) => Promise<MineStatus>;
  onMineKanji?: (kanji: KanjiEntry) => Promise<MineStatus>;
  onSpeak?: (text: string) => void;
  /** Kept mounted but visually hidden while a mining screenshot is captured, so
   *  the popup doesn't occlude the sentence in the image. */
  hiddenForCapture?: boolean;
}

export function DictionaryPopup({ result, anchor, onMouseEnter, onMouseLeave, onLayout, onMine, onMineKanji, onSpeak, hiddenForCapture }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPosition(ref, anchor, result, onLayout);

  if (!result || (!result.entries.length && !result.kanji.length) || !anchor) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Dictionary"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos && !hiddenForCapture ? "visible" : "hidden",
      }}
      className="z-50 max-h-80 w-80 overflow-y-auto border bg-popover text-popover-foreground shadow-md"
    >
      <DictionaryResult result={result} onMine={onMine} onMineKanji={onMineKanji} onSpeak={onSpeak} />
    </div>
  );
}
