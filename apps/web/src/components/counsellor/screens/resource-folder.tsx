import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Download, Eye, FolderX, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatePanel } from "@/components/counsellor/shared/info";
import { Paginated } from "@/components/counsellor/shared/paginated";
import { SortHead, useSort } from "@/components/counsellor/shared/sortable-head";
import { useResources } from "./resources";
import { fmtUpdated, folderLook, formatBytes, iconForType, safeFileUrl, type ResourceItem } from "./resources-model";

/** One resource folder (Naji's design): every file in the category, from GET /counsellor-resources. */
export function CounsellorResourceFolder({ folderName }: { folderName: string }) {
  const { data, isLoading, isError, refetch } = useResources();
  const files = useMemo(() => (data?.items ?? []).filter((r) => r.category === folderName), [data, folderName]);
  const look = folderLook(folderName);

  const { sorted, sort } = useSort<ResourceItem>(files, {
    name: (f) => f.title,
    type: (f) => f.type,
    size: (f) => f.file_size_bytes,
    updated: (f) => (f.updated_at ? new Date(f.updated_at) : null),
  });

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to="/resources"><ArrowLeft className="h-4 w-4 mr-1" /> All Folders</Link>
      </Button>

      {isLoading ? (
        <StatePanel icon={<RefreshCcw className="h-7 w-7 animate-spin text-muted-foreground/60" />} title="Loading folder…" />
      ) : isError ? (
        <StatePanel
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          title="Couldn't load this folder"
          hint="Please try again."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : files.length === 0 ? (
        <StatePanel icon={<FolderX className="h-7 w-7 text-muted-foreground/70" />} title="Folder not found" hint="This folder is empty or no longer exists." />
      ) : (
        <>
          <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
            <div className="flex items-start gap-4">
              <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${look.color} grid place-items-center text-3xl shadow`}>{look.icon}</div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">{folderName}</h1>
                <div className="mt-3 flex gap-2">
                  <Badge variant="secondary">{files.length} {files.length === 1 ? "file" : "files"}</Badge>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden shadow-[var(--shadow-soft)] border-border/70">
            <div className="overflow-x-auto">
              <Paginated items={sorted} pageSize={8}>
                {(rows) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHead k="name" s={sort}>File Name</SortHead>
                        <SortHead k="type" s={sort}>Type</SortHead>
                        <SortHead k="size" s={sort}>Size</SortHead>
                        <SortHead k="updated" s={sort}>Last Updated</SortHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((file) => (
                        <FileRow key={file.id} file={file} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paginated>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function FileRow({ file }: { file: ResourceItem }) {
  const Icon = iconForType(file.type);
  const url = safeFileUrl(file.file_url);
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted grid place-items-center shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <span className="font-medium">{file.title}</span>
            {file.description && <p className="text-xs text-muted-foreground line-clamp-1">{file.description}</p>}
          </div>
        </div>
      </TableCell>
      <TableCell><Badge variant="outline">{file.type}</Badge></TableCell>
      <TableCell className="text-muted-foreground">{formatBytes(file.file_size_bytes)}</TableCell>
      <TableCell className="text-muted-foreground">{fmtUpdated(file.updated_at)}</TableCell>
      <TableCell className="text-right">
        {url ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4 mr-1" /> Preview</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={url} download target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4 mr-1" /> Download</a>
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">File not available yet</span>
        )}
      </TableCell>
    </TableRow>
  );
}
