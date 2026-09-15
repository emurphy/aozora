import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { DictionaryResult } from "@/features/reader/dictionary-result";
import { speakVoicevox } from "@/lib/reader/voicevox";
import { ttsParams, useTtsStore } from "@/stores/tts-store";
import { mineEntry } from "./mine-word";
import type { LookupResult } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Word to look up as soon as the panel opens (from a row's lookup button). */
  initialQuery?: string;
  /** Button the popup hangs off. A plain element works as radix's virtual anchor. */
  anchor?: HTMLElement | null;
}

/**
 * Look a word up without opening a book: same engine and same rendering as the
 * reader's hover popup, driven by a typed query. Nothing here is recorded: the
 * words list counts words met while reading, and a deliberate search is not one.
 */
export function LookupPanel({ open, onOpenChange, initialQuery, anchor }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const ttsEnabled = useTtsStore((s) => s.enabled);

  const search = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(q);
    try {
      setResult(await window.electronAPI.dictionary.lookup(q));
    } finally {
      setLoading(false);
    }
  };

  // Opening from a row skips straight to that word; closing clears the panel so
  // the next open doesn't flash the previous result.
  useEffect(() => {
    if (!open) {
      setText("");
      setResult(null);
      setSearched("");
      return;
    }
    setText(initialQuery ?? "");
    if (initialQuery) void search(initialQuery);
  }, [open, initialQuery]);

  const speak = (word: string) => {
    const s = useTtsStore.getState();
    void speakVoicevox(word, { server: s.voicevoxServer, styleId: s.voicevoxSpeaker, params: ttsParams(s) }).then((err) => {
      if (err) toast.error(err);
    });
  };

  const empty = !loading && searched && !result?.entries.length && !result?.kanji.length;

  return (
    // modal: a sheet or context menu may be open underneath, and a non-modal
    // layer over one dismisses it on the first click inside this popup.
    <Popover open={open} onOpenChange={onOpenChange} modal>
      {anchor && <PopoverAnchor virtualRef={{ current: anchor }} />}
      <PopoverContent
        align="start"
        collisionPadding={12}
        onOpenAutoFocus={(e) => {
          e.preventDefault(); // radix focuses the panel; the query field is the point
          inputRef.current?.focus();
        }}
        className="flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[26rem] flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // isComposing: Enter while an IME candidate is open only commits it.
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void search(text);
            }}
            placeholder="食べさせられた、綺麗、ゆっくり…"
            className="h-8 flex-1"
          />
          <Button onClick={() => void search(text)} disabled={loading || !text.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Look up
          </Button>
        </div>

        <div className="min-h-24 flex-1 overflow-y-auto border bg-background">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : empty ? (
            <p className="px-3 py-10 text-center text-xs text-muted-foreground">No entry for “{searched}”.</p>
          ) : result ? (
            <DictionaryResult result={result} onMine={mineEntry} onSpeak={ttsEnabled ? speak : undefined} />
          ) : (
            <p className="px-3 py-10 text-center text-xs text-muted-foreground">Type a word and press Enter.</p>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">Searches here are not added to your words list.</p>
      </PopoverContent>
    </Popover>
  );
}
