import { useEffect, useMemo, useState } from "react";
import { Check, Heart, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCollectionsStore } from "@/stores/collections-store";
import { useLibraryStore } from "@/stores/library-store";
import { useUiStore } from "@/stores/ui-store";
import { normalizeSearch } from "@/lib/format";
import { coverPlaceholder } from "@/lib/cover";
import { FAVORITES_COLLECTION_ID, FAVORITES_COLLECTION_NAME, type Book, type Collection } from "@/lib/types";

/**
 * Create a collection, or rename the one passed in. `onCreated` receives the new
 * collection so the caller can jump to it (or drop a book into it).
 */
export function CollectionFormDialog({
  open,
  onOpenChange,
  collection,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: Collection | null;
  onCreated?: (collection: Collection) => void;
}) {
  const createCollection = useCollectionsStore((s) => s.createCollection);
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // The dialog instance is reused, so seed the field each time it opens.
  useEffect(() => {
    if (open) setName(collection?.name ?? "");
  }, [open, collection]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name can't be empty");
      return;
    }
    setSaving(true);
    try {
      if (collection) {
        await renameCollection(collection.id, trimmed);
      } else {
        const created = await createCollection(trimmed);
        if (created) onCreated?.(created);
      }
      onOpenChange(false);
    } catch {
      toast.error(collection ? "Failed to rename collection" : "Failed to create collection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-100">
        <DialogHeader>
          <DialogTitle>{collection ? "Rename collection" : "New collection"}</DialogTitle>
          <DialogDescription>
            {collection ? "Give this collection a new name." : "Group books any way you like: a series, a publisher, a mood."}
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Collection name"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {collection ? "Rename" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirms dropping a collection. The books in it are left alone. */
export function DeleteCollectionDialog({
  collection,
  open,
  onOpenChange,
}: {
  collection: Collection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const removeCollection = useCollectionsStore((s) => s.removeCollection);

  const handleDelete = async () => {
    if (!collection) return;
    try {
      await removeCollection(collection.id);
      // The library would otherwise stay narrowed to a shelf that no longer exists.
      const ui = useUiStore.getState();
      if (ui.collectionFilter === collection.id) ui.setCollectionFilter(null);
      toast.success("Collection deleted");
    } catch {
      toast.error("Failed to delete collection");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete collection?</AlertDialogTitle>
          <AlertDialogDescription>“{collection?.name}” will be removed. The books in it stay in your library.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** One toggleable shelf row in the picker below. */
function ShelfRow({
  label,
  count,
  checked,
  icon: Icon,
  onToggle,
}: {
  label: string;
  count?: number;
  checked: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-2 py-2 text-left text-xs transition-colors hover:bg-muted/60"
    >
      <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">{count}</span>}
    </button>
  );
}

/**
 * Which shelves one book sits on. Toggles apply immediately (there is nothing to
 * undo), so the dialog only has a close button. The built-in shelf is listed
 * alongside the real collections even though it is the `favorite` flag underneath.
 */
export function BookCollectionsDialog({ book, open, onOpenChange }: { book: Book; open: boolean; onOpenChange: (open: boolean) => void }) {
  const collections = useCollectionsStore((s) => s.collections);
  const setBookCollections = useCollectionsStore((s) => s.setBookCollections);
  const createCollection = useCollectionsStore((s) => s.createCollection);
  const addBooksToCollection = useCollectionsStore((s) => s.addBooksToCollection);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const books = useLibraryStore((s) => s.books);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) setNewName("");
  }, [open]);

  const favoriteCount = useMemo(() => books.filter((b) => b.favorite).length, [books]);
  const memberOf = useMemo(() => new Set(collections.filter((c) => c.bookIds.includes(book.id)).map((c) => c.id)), [collections, book.id]);

  const toggle = (id: string) => {
    const next = memberOf.has(id) ? [...memberOf].filter((x) => x !== id) : [...memberOf, id];
    setBookCollections(book.id, next).catch(() => toast.error("Failed to update collections"));
  };

  const createAndAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const created = await createCollection(trimmed);
      if (created) await addBooksToCollection(created.id, [book.id]);
      setNewName("");
    } catch {
      toast.error("Failed to create collection");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-100">
        <DialogHeader>
          <DialogTitle>Collections</DialogTitle>
          <DialogDescription className="truncate">Choose the shelves “{book.title}” belongs to.</DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto border">
          <ShelfRow
            label={FAVORITES_COLLECTION_NAME}
            icon={Heart}
            count={favoriteCount}
            checked={book.favorite}
            onToggle={() => toggleFavorite(book.id).catch(() => toast.error(`Failed to update ${FAVORITES_COLLECTION_NAME}`))}
          />
          {collections.map((c) => (
            <ShelfRow key={c.id} label={c.name} count={c.bookIds.length} checked={memberOf.has(c.id)} onToggle={() => toggle(c.id)} />
          ))}
        </div>

        <div className="flex gap-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void createAndAdd()}
            placeholder="New collection"
          />
          <Button variant="outline" onClick={createAndAdd} disabled={!newName.trim()}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One cover in the picker grid, dimmed until picked. */
function PickerTile({ book, checked, onToggle }: { book: Book; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} title={book.title} aria-pressed={checked} className="flex flex-col text-left">
      {/* The frame sits outside the cover, so picking a book never nudges the grid. */}
      <span
        className={cn(
          "block w-full border p-1 transition-colors",
          checked ? "border-primary/40 bg-primary/5" : "border-border/60 hover:border-foreground/30",
        )}
      >
        <span className="relative block aspect-2/3 w-full overflow-hidden bg-muted">
          <img
            src={book.coverDataUrl ?? coverPlaceholder(book)}
            alt=""
            draggable={false}
            className={cn("h-full w-full object-cover transition-opacity", !checked && "opacity-70")}
          />
          {checked && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center bg-primary text-primary-foreground">
              <Check className="size-3" />
            </span>
          )}
        </span>
      </span>
      <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-foreground/90">{book.title}</span>
    </button>
  );
}

/** The shelf a picker is filling: a collection row, or the built-in one. */
export interface ShelfTarget {
  id: string;
  name: string;
  bookIds: string[];
}

/**
 * Fills a shelf from the library in one pass: search, tick what belongs, save.
 * Members come pre-ticked, so unticking removes them too. A collection is
 * written in one call; the built-in shelf has no membership table, so its diff
 * goes out as one favorite flag per changed book.
 */
export function CollectionBooksDialog({
  shelf,
  open,
  onOpenChange,
}: {
  shelf: ShelfTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const books = useLibraryStore((s) => s.books);
  const setFavorite = useLibraryStore((s) => s.setFavorite);
  const setCollectionBooks = useCollectionsStore((s) => s.setCollectionBooks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed from the shelf each time it opens: the instance is reused.
  useEffect(() => {
    if (!open || !shelf) return;
    setSelected(new Set(shelf.bookIds));
    setSearch("");
  }, [open, shelf]);

  const visible = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return books;
    return books.filter((b) => (normalizeSearch(b.title) + normalizeSearch(b.author)).includes(q));
  }, [books, search]);

  const update = (fn: (next: Set<string>) => void) =>
    setSelected((prev) => {
      const next = new Set(prev);
      fn(next);
      return next;
    });

  const save = async () => {
    if (!shelf) return;
    setSaving(true);
    try {
      if (shelf.id === FAVORITES_COLLECTION_ID) {
        const before = new Set(shelf.bookIds);
        for (const id of selected) if (!before.has(id)) await setFavorite(id, true);
        for (const id of before) if (!selected.has(id)) await setFavorite(id, false);
      } else {
        await setCollectionBooks(shelf.id, [...selected]);
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to update collection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-170">
        <DialogHeader>
          <DialogTitle>Choose from library</DialogTitle>
          <DialogDescription className="truncate">Pick everything that belongs in “{shelf?.name}”.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or author" className="pl-8" />
          </div>
          <Button variant="outline" onClick={() => update((next) => visible.forEach((b) => next.add(b.id)))} disabled={!visible.length}>
            Select all
          </Button>
          <Button variant="outline" onClick={() => update((next) => visible.forEach((b) => next.delete(b.id)))} disabled={!visible.length}>
            Clear
          </Button>
        </div>

        <div className="max-h-[52vh] min-h-40 overflow-y-auto border p-3">
          {visible.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No books match your search.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-x-3 gap-y-4">
              {visible.map((book) => (
                <PickerTile
                  key={book.id}
                  book={book}
                  checked={selected.has(book.id)}
                  onToggle={() => update((next) => (next.has(book.id) ? next.delete(book.id) : next.add(book.id)))}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
