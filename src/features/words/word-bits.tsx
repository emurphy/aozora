import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { splitOnTerm } from "@/lib/vocab/mark";
import bookTemplate from "@/assets/book-template.png";
import type { Book, VocabEntry } from "@/lib/types";

/** Small pieces shared by the words table, the book filter and the detail sheet. */

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

/** A book's cover, sized by the caller. Falls back to the placeholder art. */
export function BookCover({ book, className }: { book: Book; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.coverDataUrl]);
  return (
    <img
      src={!book.coverDataUrl || failed ? bookTemplate : book.coverDataUrl}
      alt=""
      title={book.title}
      onError={() => setFailed(true)}
      draggable={false}
      className={cn("bg-muted object-cover", className)}
    />
  );
}

/** The word with its reading on the line below, as the popup showed it.
 *  `onLookUp` adds a button beside the pair that opens the dictionary for the word. */
export function Headword({ entry, size = "sm", onLookUp }: { entry: VocabEntry; size?: "sm" | "lg"; onLookUp?: (anchor: HTMLElement) => void }) {
  const large = size === "lg";
  return (
    <span className="flex items-center gap-1">
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("font-medium", large ? "text-xl" : "text-sm")}>{entry.expression}</span>
        {entry.reading && entry.reading !== entry.expression && (
          <span className={cn("text-muted-foreground", large ? "mt-1 text-xs" : "text-[11px]")}>{entry.reading}</span>
        )}
      </span>
      {onLookUp && (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Look up ${entry.expression}`}
          onClick={(e) => {
            e.stopPropagation(); // the row itself opens the detail sheet
            onLookUp(e.currentTarget);
          }}
          className="text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Search />
        </Button>
      )}
    </span>
  );
}
