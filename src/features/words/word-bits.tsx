import { cn } from "cn";
import { splitOnTerm } from "@/lib/vocab/mark";
import type { VocabEntry } from "@/lib/types";

/** Small pieces shared by the words table and the detail sheet. */

/** A sentence with every occurrence of the word marked. */
export function MarkedSentence({ sentence, terms, className }: { sentence: string; terms: (string | null | undefined)[]; className?: string }) {
  return (
    <span className={className}>
      {splitOnTerm(sentence, terms).map((part, i) =>
        part.hit ? (
          <mark key={i} className="bg-yellow-200 px-px text-foreground dark:bg-yellow-400/30 dark:text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

/** The word with its reading on the line below, as the popup showed it. */
export function Headword({ entry, size = "sm" }: { entry: VocabEntry; size?: "sm" | "lg" }) {
  const large = size === "lg";
  return (
    <span className="flex flex-col leading-tight">
      <span className={cn("font-medium", large ? "text-xl" : "text-sm")}>{entry.expression}</span>
      {entry.reading && entry.reading !== entry.expression && (
        <span className={cn("text-muted-foreground", large ? "mt-1 text-xs" : "text-[11px]")}>{entry.reading}</span>
      )}
    </span>
  );
}
