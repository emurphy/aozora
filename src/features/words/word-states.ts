import type { VocabState } from "@/lib/types";

/** Shared labels and row colours for a word's state. */

export const STATE_LABELS: Record<VocabState, string> = {
  new: "New",
  learning: "Learning",
  known: "Known",
  ignored: "Ignored",
};

export const STATE_STYLES: Record<VocabState, string> = {
  new: "text-foreground/70",
  learning: "text-amber-600 dark:text-amber-400",
  known: "text-emerald-600 dark:text-emerald-400",
  ignored: "text-muted-foreground/60 line-through",
};
