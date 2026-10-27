// Searchable single-select for the lead's reference (a student or an external
// referee). Options are passed in; `filterLocally={false}` lets a server-side
// search (students) own the filtering.

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { matchesReference } from "./lead-references";
import type { ReferenceOption } from "./referees";

interface ReferenceSearchProps {
  id?: string;
  options: ReferenceOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** Shown when `value` is set but not among `options` (edit mode, paged search). */
  fallbackLabel?: string;
  loading?: boolean;
  invalid?: boolean;
  filterLocally?: boolean;
  onQueryChange?: (query: string) => void;
}

export function ReferenceSearch({
  id,
  options,
  value,
  onChange,
  label,
  fallbackLabel,
  loading,
  invalid,
  filterLocally = true,
  onQueryChange,
}: ReferenceSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Remember the picked option: a server-searched list drops it once the query changes.
  const [picked, setPicked] = useState<ReferenceOption | null>(null);

  const selected =
    options.find((o) => o.id === value) ?? (picked?.id === value ? picked : undefined);
  const visible = filterLocally
    ? options.filter((o) => matchesReference(query, [o.name, o.email, o.detail ?? ""]))
    : options;

  const setSearch = (next: string) => {
    setQuery(next);
    onQueryChange?.(next);
  };

  const triggerText = selected
    ? selected.name
    : value
      ? (fallbackLabel ?? `#${value}`)
      : `Select ${label.toLowerCase()}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            "w-full min-w-0 justify-between font-normal",
            !value && "text-muted-foreground",
            invalid && "border-red-400",
          )}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="z-[80] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder="Search name, ID or email…"
            value={query}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[min(16rem,var(--radix-popover-content-available-height))]">
            {loading && <p className="px-3 py-3 text-sm text-muted-foreground">Loading…</p>}
            {!loading && visible.length === 0 && (
              <CommandEmpty>No matching references.</CommandEmpty>
            )}
            {visible.map((o) => (
              <CommandItem
                key={o.id}
                value={o.id}
                onSelect={() => {
                  setPicked(o);
                  onChange(o.id);
                  setOpen(false);
                  setSearch("");
                }}
                className="min-h-11 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{o.name}</p>
                  {o.detail && <p className="text-xs text-muted-foreground">{o.detail}</p>}
                  {o.email && <p className="break-all text-xs text-muted-foreground">{o.email}</p>}
                </div>
                {value === o.id && <Check className="h-4 w-4 shrink-0" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
