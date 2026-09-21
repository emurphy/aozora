import { CornerUpLeft, X } from "lucide-react";
import { cn } from "cn";

interface Props {
  /** The recorded position: a character offset, or a page ordinal for manga. */
  char: number;
  total: number;
  fixedLayout: boolean;
  /** Chapter the position sits in, when the book has a TOC. */
  label: string;
  /** The seek bar overlays the page in auto mode, so the chip clears it. */
  raised: boolean;
  onBack: () => void;
  onDismiss: () => void;
}

/** Offers the position a jump left behind, until it's taken or times out. */
export function JumpBackChip({ char, total, fixedLayout, label, raised, onBack, onDismiss }: Props) {
  const max = Math.max(1, fixedLayout && total > 1 ? total - 1 : total);
  const pct = Math.round((Math.min(char, max) / max) * 100);

  return (
    <div
      className={cn(
        "absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-none border bg-popover p-0.5 text-[11px] text-popover-foreground shadow-md",
        "animate-in fade-in slide-in-from-bottom-2 duration-150",
        raised ? "bottom-16" : "bottom-4",
      )}
    >
      <button
        type="button"
        onClick={onBack}
        title="Return to where you jumped from (Alt+Left)"
        className="flex cursor-pointer items-center gap-1.5 px-1.5 py-1 hover:bg-accent hover:text-accent-foreground"
      >
        <CornerUpLeft className="size-3.5 shrink-0" />
        <span className="tabular-nums">Back to {pct}%</span>
        {label && <span className="max-w-40 truncate opacity-60">{label}</span>}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="cursor-pointer p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
