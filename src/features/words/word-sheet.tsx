import { Search, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { relativeTime } from "@/lib/format";
import { VOCAB_STATES, type VocabEntry, type VocabOccurrence, type VocabState } from "@/lib/types";
import { STATE_LABELS } from "./word-states";
import { Headword, MarkedSentence } from "./word-bits";

interface Props {
  entry: VocabEntry | null;
  occurrences: VocabOccurrence[];
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
export function WordSheet({ entry, occurrences, onClose, onSetState, onJump, onLookUp, onMine, onForget, mining, ankiReady }: Props) {
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
                {occurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    <Card size="sm" className="gap-2">
                      <CardHeader>
                        <CardDescription className="flex items-center gap-2 text-[10px]">
                          <span className="truncate">{occurrence.bookTitle ?? "No book"}</span>
                          <span className="ml-auto shrink-0">{relativeTime(occurrence.createdAt)}</span>
                        </CardDescription>
                      </CardHeader>
                      {occurrence.sentence && (
                        <CardContent>
                          <MarkedSentence
                            sentence={occurrence.sentence}
                            terms={[occurrence.surface, entry.expression, entry.reading]}
                            className="block text-xs leading-relaxed"
                          />
                        </CardContent>
                      )}
                      {occurrence.bookId && occurrence.charOffset != null && (
                        <CardContent>
                          <Button size="xs" variant="outline" onClick={() => onJump(occurrence)}>
                            Open here
                          </Button>
                        </CardContent>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
