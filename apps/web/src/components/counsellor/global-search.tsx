import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, GraduationCap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiGet } from "@/lib/api";
import { listApplications } from "@/lib/api/applications";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const MIN_QUERY_LENGTH = 2;
const HITS_PER_GROUP = 5;

interface StudentHit {
  id: number | string;
  name: string | null;
  email: string | null;
  enrollment_id: string | null;
}

interface StudentSearchResponse {
  items: StudentHit[];
}

// Server-side search over the counsellor's own (auto-scoped) applications and
// enrolled students.
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const term = useDebouncedValue(query.trim());
  const enabled = open && term.length >= MIN_QUERY_LENGTH;

  const apps = useQuery({
    queryKey: ["counsellor", "search", "applications", term],
    queryFn: () => listApplications({ search: term, limit: HITS_PER_GROUP }),
    enabled,
  });
  const students = useQuery({
    queryKey: ["counsellor", "search", "students", term],
    queryFn: () =>
      apiGet<StudentSearchResponse>("/students", { search: term, limit: HITS_PER_GROUP }),
    enabled,
  });

  const appHits = apps.data?.items ?? [];
  const studentHits = students.data?.items ?? [];
  const searching = enabled && (apps.isFetching || students.isFetching);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden md:flex items-center gap-2 h-9 w-56 lg:w-72 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
          aria-label="Search applications and enrollments"
        >
          <Search className="h-4 w-4" />
          <span className="truncate">Search applications, students…</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Name, email, phone or ID…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {term.length < MIN_QUERY_LENGTH ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Type at least {MIN_QUERY_LENGTH} characters to search.
              </p>
            ) : searching && appHits.length + studentHits.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>
            ) : (
              <>
                <CommandEmpty>No results found.</CommandEmpty>
                {appHits.length > 0 && (
                  <CommandGroup heading="Applications">
                    {appHits.map((a) => (
                      <CommandItem
                        key={`a-${a.application_id}`}
                        value={`a-${a.application_id}`}
                        onSelect={() => {
                          close();
                          navigate({
                            to: "/students/applications/$appId",
                            params: { appId: String(a.application_id) },
                          });
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm">{a.applicant_name ?? "—"}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.custom_application_id ?? `APP-${a.application_id}`}
                            {a.course_title ? ` · ${a.course_title}` : ""}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {studentHits.length > 0 && (
                  <CommandGroup heading="My Enrollments">
                    {studentHits.map((s) => (
                      <CommandItem
                        key={`s-${s.id}`}
                        value={`s-${s.id}`}
                        onSelect={() => {
                          close();
                          navigate({
                            to: "/students/students/$id",
                            params: { id: String(s.id) },
                          });
                        }}
                      >
                        <GraduationCap className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm">{s.name ?? "—"}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.enrollment_id ?? s.email ?? ""}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
