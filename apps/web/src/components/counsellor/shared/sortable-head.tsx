import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortValue = string | number | boolean | Date | null | undefined;
export type SortDir = "asc" | "desc";

export interface SortState {
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
}

/** Sorts items by the getter registered for the active column. Click cycles asc → desc → off. */
export function useSort<T>(items: T[], getters: Record<string, (row: T) => SortValue>) {
  const [key, setKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    if (!key || !getters[key]) return items;
    const get = getters[key];
    const norm = (v: SortValue) => (v instanceof Date ? v.getTime() : typeof v === "boolean" ? Number(v) : v);
    return [...items].sort((a, b) => {
      const va = norm(get(a));
      const vb = norm(get(b));
      if (va == null || va === "") return 1;
      if (vb == null || vb === "") return -1;
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
      return dir === "asc" ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, key, dir]);

  const toggle = (k: string) => {
    if (key !== k) {
      setKey(k);
      setDir("asc");
    } else if (dir === "asc") setDir("desc");
    else setKey(null);
  };

  return { sorted, sort: { key, dir, toggle } as SortState };
}

export function SortHead({
  k,
  s,
  children,
  className,
  plain,
}: {
  k: string;
  s: SortState;
  children: ReactNode;
  className?: string;
  /** Render a plain <th> (for tables not built with the shared Table component). */
  plain?: boolean;
}) {
  const active = s.key === k;
  const Icon = !active ? ArrowUpDown : s.dir === "asc" ? ArrowUp : ArrowDown;
  const right = className?.includes("text-right");
  const Head = plain ? "th" : TableHead;
  return (
    <Head className={className} aria-sort={active ? (s.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => s.toggle(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors select-none",
          right && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {children}
        <Icon className={cn("h-3.5 w-3.5 shrink-0", !active && "opacity-40")} />
      </button>
    </Head>
  );
}

/** Render-prop wrapper so lists rendered inside .map() can each keep their own sort state. */
export function Sorted<T>({
  items,
  getters,
  children,
}: {
  items: T[];
  getters: Record<string, (row: T) => SortValue>;
  children: (sorted: T[], sort: SortState) => ReactNode;
}) {
  const { sorted, sort } = useSort(items, getters);
  return <>{children(sorted, sort)}</>;
}
