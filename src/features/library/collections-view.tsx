import { useEffect, useMemo, useState } from "react";
import { BookPlus, FolderPlus, Heart, Library, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LibrarySidebar } from "./library-sidebar";
import { CollectionBooksDialog, CollectionFormDialog, DeleteCollectionDialog, type ShelfTarget } from "./collection-dialogs";
import { useCollectionsStore } from "@/stores/collections-store";
import { useLibraryStore } from "@/stores/library-store";
import { useUiStore } from "@/stores/ui-store";
import bookTemplate from "@/assets/book-template.png";
import { FAVORITES_COLLECTION_ID, type Book, type Collection } from "@/lib/types";

/** What a shelf tile needs, whether it comes from a row or from the favorite flag. */
interface Shelf {
  id: string;
  name: string;
  books: Book[];
  /** Favorites: renaming and deleting it makes no sense. */
  builtIn?: boolean;
}

// Fan of up to three covers: the middle one sits forward, the outer two lean away.
const FAN = ["-rotate-6 translate-x-2 translate-y-1", "z-10", "rotate-6 -translate-x-2 translate-y-1"];

function CoverFan({ books }: { books: Book[] }) {
  if (!books.length) {
    return (
      <div className="flex h-28 w-20 items-center justify-center border-2 border-dashed border-border">
        <Library className="size-5 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
    );
  }
  // Three at most, and the newest in the middle where the eye lands.
  const shown = books.slice(0, 3);
  const ordered = shown.length === 3 ? [shown[1], shown[0], shown[2]] : shown;
  return (
    <div className="flex items-end -space-x-5">
      {ordered.map((book, i) => (
        <img
          key={book.id}
          src={book.coverDataUrl ?? bookTemplate}
          alt=""
          draggable={false}
          className={cn("aspect-2/3 h-28 shrink-0 object-cover shadow-md ring-1 ring-black/10", ordered.length === 3 && FAN[i])}
        />
      ))}
    </div>
  );
}

/** One shelf: a fan of its covers, its name, and (unless built-in) rename/delete. */
function ShelfTile({
  shelf,
  onOpen,
  onAddBooks,
  onRename,
  onDelete,
}: {
  shelf: Shelf;
  onOpen: () => void;
  onAddBooks: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/shelf flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        title={shelf.name}
        className="relative flex h-44 items-center justify-center overflow-hidden border bg-muted/30 px-4 transition-colors hover:border-foreground/30 hover:bg-muted/60"
      >
        <CoverFan books={shelf.books} />
        {shelf.builtIn && (
          <span className="pointer-events-none absolute left-2 top-2 flex size-5 items-center justify-center bg-black/40 text-white backdrop-blur-xs">
            <Heart className="size-3" />
          </span>
        )}
      </button>

      <div className="mt-2 flex items-start gap-1">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-medium">{shelf.name}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {shelf.books.length} {shelf.books.length === 1 ? "book" : "books"}
          </p>
        </button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Collection actions"
              className="text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/shelf:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onAddBooks}>
              <BookPlus className="size-3.5" />
              Choose from library
            </DropdownMenuItem>
            {!shelf.builtIn && (
              <>
                <DropdownMenuItem onSelect={onRename}>
                  <Pencil className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * The collections page: every shelf as a tile, Favorites first. Opening one
 * hands off to the library grid with `collectionFilter` set, so browsing a
 * collection reuses the same search / sort / view controls as the library.
 */
export function CollectionsView() {
  const books = useLibraryStore((s) => s.books);
  const loadBooks = useLibraryStore((s) => s.loadBooks);
  const collections = useCollectionsStore((s) => s.collections);
  const setView = useUiStore((s) => s.setView);
  const setStatusFilter = useUiStore((s) => s.setStatusFilter);
  const setCollectionFilter = useUiStore((s) => s.setCollectionFilter);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const [picking, setPicking] = useState<ShelfTarget | null>(null);

  useEffect(() => {
    void loadBooks().catch(() => {});
  }, [loadBooks]);

  const shelves = useMemo<Shelf[]>(() => {
    const byId = new Map(books.map((b) => [b.id, b]));
    return [
      { id: FAVORITES_COLLECTION_ID, name: "Favorites", builtIn: true, books: books.filter((b) => b.favorite) },
      ...collections.map((c) => ({
        id: c.id,
        name: c.name,
        books: c.bookIds.flatMap((id) => {
          const book = byId.get(id);
          return book ? [book] : [];
        }),
      })),
    ];
  }, [books, collections]);

  const open = (id: string) => {
    setStatusFilter("all");
    setCollectionFilter(id);
    setView("library");
  };

  const startCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="flex h-full">
      <LibrarySidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-6">
          <h1 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Collections
            <span className="ml-1.5 text-muted-foreground/70 tabular-nums">({collections.length})</span>
          </h1>
          <Button className="ml-auto" onClick={startCreate}>
            <FolderPlus className="size-4" />
            New collection
          </Button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-5 gap-y-6">
            {shelves.map((shelf) => (
              <ShelfTile
                key={shelf.id}
                shelf={shelf}
                onOpen={() => open(shelf.id)}
                onAddBooks={() => setPicking({ id: shelf.id, name: shelf.name, bookIds: shelf.books.map((b) => b.id) })}
                onRename={() => {
                  setEditing(collections.find((c) => c.id === shelf.id) ?? null);
                  setFormOpen(true);
                }}
                onDelete={() => setDeleting(collections.find((c) => c.id === shelf.id) ?? null)}
              />
            ))}
          </div>

          {collections.length === 0 && (
            <p className="mt-6 text-xs text-muted-foreground">
              Collections are yours to shape: one per series, per publisher, per anything. Favorites is always here.
            </p>
          )}
        </div>
      </div>

      <CollectionBooksDialog shelf={picking} open={picking !== null} onOpenChange={(next) => !next && setPicking(null)} />
      <CollectionFormDialog open={formOpen} onOpenChange={setFormOpen} collection={editing} />
      <DeleteCollectionDialog collection={deleting} open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)} />
    </div>
  );
}
