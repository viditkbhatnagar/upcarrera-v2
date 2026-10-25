import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginatedProps<T> {
  items: T[];
  pageSize?: number;
  children: (rows: T[], offset: number) => ReactNode;
}

/** Client-side pagination wrapper: renders the table via children plus a Prev/Next footer. */
export function Paginated<T>({ items, pageSize = 5, children }: PaginatedProps<T>) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);
  const offset = (page - 1) * pageSize;
  const rows = items.slice(offset, offset + pageSize);
  const from = items.length === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, items.length);

  return (
    <>
      {children(rows, offset)}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Showing {from}–{to} of {items.length}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" className="gap-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
