import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, FolderOpen, FolderX, RefreshCcw, Search } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatePanel } from "@/components/counsellor/shared/info";
import { folderLook, type ResourcesResponse } from "./resources-model";

export const RESOURCES_QUERY_KEY = ["counsellor", "resources"] as const;

export function useResources() {
  return useQuery({
    queryKey: RESOURCES_QUERY_KEY,
    queryFn: () => apiGet<ResourcesResponse>("/counsellor-resources"),
    staleTime: 60_000,
  });
}

/**
 * Resources folders (Naji's design), wired to GET /counsellor-resources. A folder
 * is a resource category; the design's per-folder description has no source, so
 * the card shows the file count and when it last changed.
 */
export function CounsellorResources() {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, refetch } = useResources();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.folders ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resources</h1>
          <p className="text-sm text-muted-foreground mt-1">Brochures, forms and guides you can view and download</p>
        </div>
        <div className="relative w-full sm:w-[380px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search folders" aria-label="Search folders" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <StatePanel icon={<RefreshCcw className="h-7 w-7 animate-spin text-muted-foreground/60" />} title="Loading resources…" />
      ) : isError ? (
        <StatePanel
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          title="Couldn't load the resources"
          hint="Please try again."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : (data?.folders.length ?? 0) === 0 ? (
        <StatePanel icon={<FolderX className="h-7 w-7 text-muted-foreground/70" />} title="No resources yet" hint="Brochures, posters and guides will appear here once they are published." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((f) => {
            const look = folderLook(f.name);
            return (
              <Link key={f.name} to="/resources/$id" params={{ id: f.name }}>
                <Card className="p-5 h-full hover:shadow-md transition-all hover:-translate-y-0.5 border-border/70 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start gap-3">
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${look.color} grid place-items-center text-2xl shadow-sm`}>{look.icon}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{f.name}</h3>
                      <div className="flex items-center gap-2 mt-3">
                        <Badge variant="secondary" className="gap-1">
                          <FileText className="h-3 w-3" /> {f.count} {f.count === 1 ? "file" : "files"}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <FolderOpen className="h-3 w-3" /> Open
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground col-span-full">No folders match your search.</Card>
          )}
        </div>
      )}
    </>
  );
}
