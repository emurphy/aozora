import { Copy, Info, Plus, Search, Tag, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VOCAB_STATES, type VocabEntry, type VocabState } from "@/lib/types";
import { STATE_LABELS } from "./word-states";

export interface WordActions {
  onDetails: (entry: VocabEntry) => void;
  onLookUp: (entry: VocabEntry) => void;
  onSetState: (entry: VocabEntry, state: VocabState) => void;
  onMine: (entry: VocabEntry) => void;
  onDelete: (entry: VocabEntry) => void;
  /** The word currently being pushed to Anki, if any. */
  miningId: string | null;
  ankiReady: boolean;
}

/** The subset of a menu's parts the shared items need; context and dropdown both fit. */
interface MenuParts {
  Item: React.ComponentType<{ children?: React.ReactNode; disabled?: boolean; variant?: "default" | "destructive"; onSelect?: () => void }>;
  Sub: React.ComponentType<{ children?: React.ReactNode }>;
  SubTrigger: React.ComponentType<{ children?: React.ReactNode }>;
  SubContent: React.ComponentType<{ children?: React.ReactNode }>;
  RadioGroup: React.ComponentType<{ children?: React.ReactNode; value?: string; onValueChange?: (value: string) => void }>;
  RadioItem: React.ComponentType<{ children?: React.ReactNode; value: string }>;
}

const CONTEXT_PARTS: MenuParts = {
  Item: ContextMenuItem,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
};

const DROPDOWN_PARTS: MenuParts = {
  Item: DropdownMenuItem,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
};

function WordMenuItems({ parts, entry, actions }: { parts: MenuParts; entry: VocabEntry; actions: WordActions }) {
  const { Item, Sub, SubTrigger, SubContent, RadioGroup, RadioItem } = parts;
  return (
    <>
      <Item onSelect={() => actions.onDetails(entry)}>
        <Info />
        Details
      </Item>
      <Item onSelect={() => actions.onLookUp(entry)}>
        <Search />
        Look up
      </Item>
      <Item onSelect={() => void navigator.clipboard.writeText(entry.expression)}>
        <Copy />
        Copy word
      </Item>
      <Sub>
        <SubTrigger>
          <Tag />
          Mark as
        </SubTrigger>
        <SubContent>
          <RadioGroup value={entry.state} onValueChange={(value) => actions.onSetState(entry, value as VocabState)}>
            {VOCAB_STATES.map((state) => (
              <RadioItem key={state} value={state}>
                {STATE_LABELS[state]}
              </RadioItem>
            ))}
          </RadioGroup>
        </SubContent>
      </Sub>
      <Item disabled={!actions.ankiReady || actions.miningId === entry.id} onSelect={() => actions.onMine(entry)}>
        <Plus />
        Add to Anki
      </Item>
      <Item variant="destructive" onSelect={() => actions.onDelete(entry)}>
        <Trash2 />
        Delete
      </Item>
    </>
  );
}

/** Wraps a word row so right-clicking opens the actions. */
export function WordContextMenu({ entry, actions, children }: { entry: VocabEntry; actions: WordActions; children: React.ReactNode }) {
  // modal={false}: items open a sheet or dialog, which fights the menu's body pointer-events lock.
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        <WordMenuItems parts={CONTEXT_PARTS} entry={entry} actions={actions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same actions behind the row's "⋯" button. */
export function WordActionsMenu({ entry, actions, trigger }: { entry: VocabEntry; actions: WordActions; trigger: React.ReactNode }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <WordMenuItems parts={DROPDOWN_PARTS} entry={entry} actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
