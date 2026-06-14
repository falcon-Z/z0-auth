import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import { SEARCH_ITEMS, type SearchItemGroup } from "../../config/navigation";
import { cn } from "../../lib/utils";

const GROUP_ORDER: SearchItemGroup[] = ["Go to", "Settings", "Actions"];

export function ConsoleSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return SEARCH_ITEMS;
    return SEARCH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        item.keywords.some((keyword) => keyword.includes(normalized)),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<SearchItemGroup, typeof SEARCH_ITEMS>();
    for (const group of GROUP_ORDER) {
      const items = filtered.filter((item) => item.group === group);
      if (items.length > 0) map.set(group, items);
    }
    return map;
  }, [filtered]);

  function goTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden h-8 w-56 min-w-0 shrink-0 justify-start gap-2 px-2.5 text-muted-foreground md:flex lg:w-72"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Search or jump to…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-muted px-1.5 font-mono text-[10px] lg:inline">
          ⌘K
        </kbd>
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0 md:hidden"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-4 py-3 text-left">
            <DialogTitle className="sr-only">Search</DialogTitle>
            <DialogDescription className="sr-only">Jump to a page or action in the console.</DialogDescription>
            <Input
              autoFocus
              placeholder="Search or jump to…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matched.</p>
            ) : (
              Array.from(grouped.entries()).map(([group, items]) => (
                <div key={group} className="mb-2 last:mb-0">
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</p>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full rounded-md px-2 py-2 text-left text-sm",
                            "hover:bg-accent hover:text-accent-foreground",
                          )}
                          onClick={() => goTo(item.path)}
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
