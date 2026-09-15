import { useState } from "react";
import { ChevronDown, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import type { Book } from "@/lib/types";
import { BookCover } from "./word-bits";

/** The words table's book filter: a grid of covers, "all" meaning every book. */
export function BookPicker({ books, value, onChange }: { books: Book[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = books.find((book) => book.id === value) ?? null;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-44 justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {selected ? <BookCover book={selected} className="h-4 w-3 shrink-0" /> : <Library className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate">{selected?.title ?? "Any book"}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="grid max-h-88 grid-cols-4 gap-2 overflow-y-auto p-2.5">
          <button type="button" onClick={() => pick("all")} className="group flex cursor-pointer flex-col gap-1 text-left">
            <span
              className={cn(
                "flex aspect-2/3 w-full items-center justify-center border border-dashed border-border text-muted-foreground transition-transform group-hover:-translate-y-0.5",
                value === "all" && "border-solid ring-2 ring-ring",
              )}
            >
              <Library className="size-4" />
            </span>
            <span className={cn("truncate text-[10px] leading-tight", value === "all" ? "text-foreground" : "text-muted-foreground")}>Any book</span>
          </button>

          {books.map((book) => (
            <button key={book.id} type="button" onClick={() => pick(book.id)} className="group flex cursor-pointer flex-col gap-1 text-left">
              <BookCover
                book={book}
                className={cn("aspect-2/3 w-full transition-transform group-hover:-translate-y-0.5", value === book.id && "ring-2 ring-ring")}
              />
              <span className={cn("truncate text-[10px] leading-tight", value === book.id ? "text-foreground" : "text-muted-foreground")}>
                {book.title}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
