import { useMemo, useState } from "react";
import { BarChart3, BookA, BookOpen, CheckCircle2, Circle, Heart, Languages, Library, LibraryBig, Plus, Settings } from "lucide-react";
import { cn } from "cn";
import { readingStatus } from "@/lib/format";
import { useCollectionsStore } from "@/stores/collections-store";
import { useLibraryStore } from "@/stores/library-store";
import { useUiStore, type StatusFilter } from "@/stores/ui-store";
import { CollectionFormDialog } from "./collection-dialogs";
import { FAVORITES_COLLECTION_ID } from "@/lib/types";
import aozoraLogo from "@/assets/aozora-logo.png";

const STATUS_NAV: { value: StatusFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "All books", icon: Library },
  { value: "reading", label: "Reading", icon: BookOpen },
  { value: "finished", label: "Finished", icon: CheckCircle2 },
  { value: "unread", label: "Unread", icon: Circle },
];

/** A single sidebar nav row: icon + label on the left, a count on the right. */
function NavItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors cursor-pointer",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">{count}</span>}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{children}</p>;
}

/**
 * The app's left rail: brand, status nav, collections and links. Owns nav/filter
 * state via the stores so every page renders it unchanged.
 */
export function LibrarySidebar() {
  const books = useLibraryStore((s) => s.books);
  const collections = useCollectionsStore((s) => s.collections);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const statusFilter = useUiStore((s) => s.statusFilter);
  const setStatusFilter = useUiStore((s) => s.setStatusFilter);
  const collectionFilter = useUiStore((s) => s.collectionFilter);
  const setCollectionFilter = useUiStore((s) => s.setCollectionFilter);

  const [createOpen, setCreateOpen] = useState(false);

  const inLibrary = view === "library";

  // Status counts for the nav labels. useMemo: never returned straight from a store selector.
  const counts = useMemo(() => {
    const c = { all: books.length, favorites: 0, reading: 0, finished: 0, unread: 0 };
    for (const b of books) {
      c[readingStatus(b)] += 1;
      if (b.favorite) c.favorites += 1;
    }
    return c;
  }, [books]);

  /** Every filter row is exclusive: picking one drops the other. */
  const browse = ({ status = "all", collection = null }: { status?: StatusFilter; collection?: string | null }) => {
    setView("library");
    setStatusFilter(status);
    setCollectionFilter(collection);
  };

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex shrink-0 items-center justify-center border-b p-4">
        <img src={aozoraLogo} alt="Aozora" className="h-26 w-auto object-contain" draggable={false} />
      </div>

      <nav className="shrink-0 space-y-0.5 px-2 py-3">
        <SectionLabel>Library</SectionLabel>
        {STATUS_NAV.map((item) => (
          <NavItem
            key={item.value}
            icon={item.icon}
            label={item.label}
            count={counts[item.value]}
            active={inLibrary && statusFilter === item.value && !collectionFilter}
            onClick={() => browse({ status: item.value })}
          />
        ))}
      </nav>

      <div className="shrink-0 border-t px-2 py-3">
        <div className="flex items-center gap-1 pb-1">
          <button
            type="button"
            onClick={() => setView("collections")}
            title="Browse collections"
            className={cn(
              "px-2 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer",
              view === "collections" ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground",
            )}
          >
            Collections
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="New collection"
            title="New collection"
            className="ml-auto flex size-5 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground cursor-pointer"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <nav className="max-h-44 space-y-0.5 overflow-y-auto [&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar-thumb]:transition-colors hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40">
          <NavItem
            icon={Heart}
            label="Favorites"
            count={counts.favorites}
            active={inLibrary && collectionFilter === FAVORITES_COLLECTION_ID}
            onClick={() => browse({ collection: FAVORITES_COLLECTION_ID })}
          />
          {collections.map((c) => (
            <NavItem
              key={c.id}
              icon={LibraryBig}
              label={c.name}
              count={c.bookIds.length}
              active={inLibrary && collectionFilter === c.id}
              onClick={() => browse({ collection: c.id })}
            />
          ))}
        </nav>
      </div>

      <nav className="shrink-0 space-y-0.5 border-t px-2 py-3">
        <NavItem icon={BarChart3} label="Statistics" active={view === "stats"} onClick={() => setView("stats")} />
        <NavItem icon={Languages} label="Words" active={view === "words"} onClick={() => setView("words")} />
        <NavItem icon={BookA} label="Dictionaries" active={view === "dictionaries"} onClick={() => setView("dictionaries")} />
        <NavItem icon={Settings} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
      </nav>

      <CollectionFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </aside>
  );
}
