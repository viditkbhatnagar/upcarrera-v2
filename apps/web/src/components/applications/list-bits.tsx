// Small presentational pieces of the Applications list (filters, row buttons,
// empty state). Split out of routes/students.applications.index.tsx.

import { ChevronDown, Eye, FileText, Plus, Search } from "lucide-react";
import type { CatalogOption } from "./catalogs";


export function FilterInput({
  icon: Icon,
  placeholder,
  value,
  onChange,
}: {
  icon: typeof Search;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

/** A catalog-backed filter. The value is the entity id; "" is "All". */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CatalogOption[];
  placeholder: string;
  loading?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Filter by ${placeholder.toLowerCase()}`}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <option value="">{loading ? `Loading ${placeholder.toLowerCase()}…` : `All ${placeholder}`}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export function IconBtn({
  icon: Icon,
  title,
  onClick,
}: {
  icon: typeof Eye;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="group grid h-8 w-8 place-items-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function BulkBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/5 text-primary">
        <FileText className="h-10 w-10" />
      </div>
      <div className="mt-5 text-base font-semibold text-foreground">No applications found</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try adjusting your filters or add a lead to get started.
      </div>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" />
        Add Lead
      </button>
    </div>
  );
}
