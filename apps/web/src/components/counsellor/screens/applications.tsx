import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Eye, FileText, Loader2, Pencil, Plus, Search, UserPlus } from "lucide-react";
import { ApiError, apiGet } from "@/lib/api";
import { applicationKeys, listApplications, type Stage } from "@/lib/api/applications";
import {
  useCourseOptions,
  useIntakeOptions,
  useLeadSourceOptions,
  useUniversityOptions,
} from "@/components/applications/catalogs";
import { formatPhone } from "@/components/counsellors/phone";
import { AddLeadDialog } from "@/components/applications/lead-dialog";
import { EditApplicationDialog } from "@/components/applications/edit-application-dialog";
import { downloadCsv, EXPORT_ROW_CAP, toCsv } from "@/components/applications/export-csv";
import {
  type ApplicationListResponse,
  type ListRowView,
  CSV_COLUMNS,
  EMPTY,
  PAGE_SIZE,
  exportFilename,
  mapRow,
} from "@/components/applications/list-model";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { StageBadge } from "../shared/stage-badge";
import { DateRangePicker } from "../shared/date-range-picker";
import { type DateRange } from "@/lib/date-range";
import { TAB_ALL, TABS, tabCount, tabStages } from "./applications-tabs";

/** The URL-backed filters the shared /students/applications route owns. */
export interface CounsellorApplicationsSearch {
  search?: string;
  university_id?: string;
  course_id?: string;
  session_id?: string;
  source?: string;
  /** ISO dates (YYYY-MM-DD) on applications.created_at. */
  date_from?: string;
  date_to?: string;
  /** Legacy single backend stage (kept so old links still filter). */
  stage?: Stage;
  /** Sharon's tab label ("All" when absent). */
  tab?: string;
  page?: number;
}

interface Props {
  search: CounsellorApplicationsSearch;
  /** Draft text of the search box (debounced into the URL by the route). */
  draft: string;
  onDraft: (v: string) => void;
  /** Merge filters into the URL (resets to page 1 for everything except `page`). */
  onFilter: (partial: Partial<CounsellorApplicationsSearch>) => void;
}

const ALL = "all";

/**
 * "My Applications" for the counsellor, in Naji's layout: header + Export / Add Lead,
 * stage pill tabs with counts, a filter card, and a student-avatar table with
 * Course & Specialisation, Contact and Source. Data is the real, server-scoped
 * GET /applications list (the counsellor only ever receives their own records).
 */
export function CounsellorApplications({ search, draft, onDraft, onFilter }: Props) {
  const [leadOpen, setLeadOpen] = useState(false);
  const [editing, setEditing] = useState<ListRowView | null>(null);
  const [exporting, setExporting] = useState(false);

  const page = search.page ?? 1;
  const tab = search.tab && TABS.some((t) => t.label === search.tab) ? search.tab : TAB_ALL;
  const stages = search.stage && tab === TAB_ALL ? [search.stage] : tabStages(tab);

  const universities = useUniversityOptions();
  const courses = useCourseOptions(search.university_id ?? null);
  const intakes = useIntakeOptions();
  const sources = useLeadSourceOptions();

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(search.search ? { search: search.search } : {}),
      ...(search.university_id ? { university_id: search.university_id } : {}),
      ...(search.course_id ? { course_id: search.course_id } : {}),
      ...(search.session_id ? { session_id: search.session_id } : {}),
      ...(search.source ? { source: search.source } : {}),
      ...(search.date_from ? { date_from: search.date_from } : {}),
      ...(search.date_to ? { date_to: search.date_to } : {}),
      // Single-stage tabs use `stage`; grouped tabs send the comma-separated list.
      ...(stages?.length === 1 ? { stage: stages[0] } : {}),
      ...(stages && stages.length > 1 ? { stages: stages.join(",") } : {}),
    }),
    [search, page, stages],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...applicationKeys.list, listParams],
    queryFn: () => listApplications(listParams),
    placeholderData: (prev) => prev,
  });

  const total = data?.total ?? 0;
  const counts = data?.counts;
  const rows = useMemo(() => (data?.items ?? []).map(mapRow), [data]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const allCount = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const dates: DateRange = {
    from: search.date_from ? new Date(`${search.date_from}T00:00:00`) : undefined,
    to: search.date_to ? new Date(`${search.date_to}T00:00:00`) : undefined,
  };
  const isoLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const from = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, total);

  const exportFiltered = async () => {
    if (total === 0 || exporting) return;
    setExporting(true);
    try {
      const all = await apiGet<ApplicationListResponse>("/applications", {
        ...listParams,
        page: 1,
        limit: Math.min(total, EXPORT_ROW_CAP),
      });
      const exportRows = all.items.map(mapRow);
      downloadCsv(exportFilename("filtered"), toCsv(exportRows, CSV_COLUMNS));
      toast.success(`Exported ${exportRows.length.toLocaleString()} applications.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not export applications.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Applications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track every student application from lead to enrollment
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportFiltered} disabled={total === 0 || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export"}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setLeadOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Lead
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/students/applications/new">
              <Plus className="h-4 w-4" /> New Application
            </Link>
          </Button>
        </div>
      </div>

      {/* Stage tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <PillButton
            key={t.label}
            active={tab === t.label}
            count={tabCount(t.label, counts)}
            onClick={() => onFilter({ tab: tab === t.label ? undefined : t.label, stage: undefined })}
          >
            {t.label}
          </PillButton>
        ))}
        <PillButton active={tab === TAB_ALL && !search.stage} count={allCount} onClick={() => onFilter({ tab: undefined, stage: undefined })}>
          All
        </PillButton>
      </div>

      {/* Filters */}
      <Card className="p-4 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID, email or phone…"
              className="pl-9"
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
            />
          </div>
          <FilterDropdown
            className="md:w-52"
            placeholder="University"
            allLabel="All Universities"
            value={search.university_id}
            options={universities.options}
            onChange={(v) => onFilter({ university_id: v, course_id: undefined })}
          />
          <FilterDropdown
            className="md:w-44"
            placeholder="Course"
            allLabel="All Courses"
            value={search.course_id}
            options={courses.options}
            onChange={(v) => onFilter({ course_id: v })}
          />
          <FilterDropdown
            className="md:w-40"
            placeholder="Intake"
            allLabel="All Intakes"
            value={search.session_id}
            options={intakes.options}
            onChange={(v) => onFilter({ session_id: v })}
          />
          <FilterDropdown
            className="md:w-40"
            placeholder="Source"
            allLabel="All Sources"
            value={search.source}
            options={sources.options}
            onChange={(v) => onFilter({ source: v })}
          />
          <DateRangePicker
            label="Date"
            value={dates}
            onChange={(r) =>
              onFilter({
                date_from: r.from ? isoLocal(r.from) : undefined,
                date_to: r.from ? isoLocal(r.to ?? r.from) : undefined,
              })
            }
          />
        </div>
      </Card>

      {/* Table */}
      <Card className="shadow-[var(--shadow-soft)] border-border/70 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Application ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>University</TableHead>
                <TableHead>Course &amp; Specialisation</TableHead>
                <TableHead>Intake</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">Loading applications…</TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-destructive">
                    Couldn't load applications{error instanceof Error ? `: ${error.message}` : "."}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    No applications match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((a, idx) => (
                  <ApplicationRow
                    key={a.rowId}
                    index={(currentPage - 1) * PAGE_SIZE + idx + 1}
                    app={a}
                    onEdit={() => setEditing(a)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
            <span className="font-medium text-foreground">{total.toLocaleString()}</span> applications
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={currentPage === 1}
              onClick={() => onFilter({ page: Math.max(1, currentPage - 1) })}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={currentPage >= totalPages}
              onClick={() => onFilter({ page: Math.min(totalPages, currentPage + 1) })}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <AddLeadDialog
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        onShowInList={(id) => onFilter({ search: id })}
      />
      <EditApplicationDialog
        applicationId={editing?.rowId ?? null}
        displayId={editing?.id ?? null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function FilterDropdown({
  className,
  placeholder,
  allLabel,
  value,
  options,
  onChange,
}: {
  className?: string;
  placeholder: string;
  allLabel: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className={className} aria-label={`Filter by ${placeholder.toLowerCase()}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PillButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number | undefined;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {children}
      <span
        className={cn(
          "rounded-full px-1.5 py-px text-[10px] font-semibold",
          active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {count === undefined ? "…" : count.toLocaleString()}
      </span>
    </button>
  );
}

function ApplicationRow({ index, app, onEdit }: { index: number; app: ListRowView; onEdit: () => void }) {
  const initials =
    app.name === EMPTY ? "—" : app.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const detail = { to: "/students/applications/$appId" as const, params: { appId: String(app.rowId) } };
  return (
    <TableRow className="hover:bg-muted/30 group">
      <TableCell className="text-xs text-muted-foreground">{String(index).padStart(2, "0")}</TableCell>
      <TableCell>
        <Link {...detail} className="font-mono text-xs font-medium text-primary hover:underline">
          {app.id}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{app.date}</TableCell>
      <TableCell>
        <Link {...detail} className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary-soft text-accent-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm font-medium leading-tight">{app.name}</p>
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{app.university}</TableCell>
      <TableCell>
        <p className="text-sm font-medium">{app.course}</p>
        {app.specialisation !== EMPTY && <p className="text-[11px] text-muted-foreground">{app.specialisation}</p>}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{app.intake}</TableCell>
      <TableCell>
        <p className="text-xs font-medium">{app.email}</p>
        <p className="text-[11px] text-muted-foreground">{formatPhone(app.phone, null, EMPTY)}</p>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{app.source}</TableCell>
      <TableCell>
        <StageBadge stage={app.stage} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="View" aria-label={`View ${app.id}`}>
            <Link {...detail}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" aria-label={`Edit ${app.id}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
