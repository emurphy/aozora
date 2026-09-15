import { Search, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { relativeTime } from "@/lib/format";
import { VOCAB_STATES, type Book, type VocabEntry, type VocabOccurrence, type VocabState } from "@/lib/types";
import { STATE_LABELS } from "./word-states";
import { BookCover, Headword, MarkedSentence } from "./word-bits";

interface Props {
  entry: VocabEntry | null;
  occurrences: VocabOccurrence[];
  booksById: Map<string, Book>;
  onClose: () => void;
  onSetState: (entry: VocabEntry, state: VocabState) => void;
  /** Opens the book at the passage the word was met in. */
  onJump: (occurrence: VocabOccurrence) => void;
  onLookUp: (entry: VocabEntry, anchor: HTMLElement) => void;
  onMine: (entry: VocabEntry) => void;
  onForget: (entry: VocabEntry) => void;
  mining: boolean;
  ankiReady: boolean;
}

/** "Met 3 times (first met 2d ago)", singular-aware. */
function metLine(entry: VocabEntry): string {
  const first = relativeTime(entry.firstAt) ?? "";
  return entry.lookupCount === 1 ? `Met once (${first})` : `Met ${entry.lookupCount} times (first met ${first})`;
}

/** One word in full: its state, how often it was met, and every sighting. */
export function WordSheet({ entry, occurrences, booksById, onClose, onSetState, onJump, onLookUp, onMine, onForget, mining, ankiReady }: Props) {
  return (
    <Sheet open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-96 sm:max-w-96">
        {entry && (
          <>
            <SheetHeader>
              <SheetTitle>
                <Headword entry={entry} size="lg" />
              </SheetTitle>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-muted-foreground">{metLine(entry)}</p>
                {entry.minedAt && (
                  <Badge variant="outline" className="text-[10px]">
                    In Anki
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={entry.state} onValueChange={(v) => onSetState(entry, v as VocabState)}>
                  <SelectTrigger size="sm" className="w-28" aria-label="Word state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOCAB_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {STATE_LABELS[state]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={(e) => onLookUp(entry, e.currentTarget)}>
                  <Search className="size-3.5" />
                  Look up
                </Button>
                <Button size="sm" variant="outline" onClick={() => onMine(entry)} disabled={!ankiReady || mining}>
                  <Plus className="size-3.5" />
                  Anki
                </Button>
                <Button size="icon-sm" variant="outline" aria-label="Delete word" onClick={() => onForget(entry)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <ul className="space-y-2">
                {occurrences.map((occurrence) => {
                  const book = occurrence.bookId ? booksById.get(occurrence.bookId) : undefined;
                  return (
                    <li key={occurrence.id}>
                      <Card size="sm">
                        <CardContent className="flex gap-3">
                          {/* self-stretch: the cover takes the card's height, so its foot lines up with the button row. */}
                          {book && <BookCover book={book} className="w-14 min-h-20 shrink-0 self-stretch" />}
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            {occurrence.sentence && (
                              <MarkedSentence
                                sentence={occurrence.sentence}
                                terms={[occurrence.surface, entry.expression, entry.reading]}
                                className="block text-xs leading-relaxed"
                              />
                            )}
                            <div className="mt-auto flex items-center justify-between gap-2">
                              <span className="text-[10px] text-muted-foreground">{relativeTime(occurrence.createdAt)}</span>
                              {occurrence.bookId && occurrence.charOffset != null && (
                                <Button size="xs" variant="outline" onClick={() => onJump(occurrence)}>
                                  Open here
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
