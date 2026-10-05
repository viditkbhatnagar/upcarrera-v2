import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Download,
  Search,
  Filter,
  RotateCcw,
  Eye,
  Pencil,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  MoreHorizontal,
  CheckCircle2,
  CalendarClock,
  CopyPlus,
  Ban,
  Trash2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { getUser } from "@/lib/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUniversityOptions, useCourseOptions } from "@/components/applications/catalogs";
import {
  activateFeeStructure,
  copyFeeStructure,
  downloadFeeStructuresCsv,
  feeStructureKeys,
  formatInr,
  listFeeStructures,
  listIntakes,
  type FeeStructureListItem,
  type ListFeeStructuresParams,
} from "@/lib/api/fee-structures";
import { CollectionModelBadge, IntakeStatusBadge, StatusChip } from "@/components/fee-structure/badges";
import {
  CopyIntakeDialog,
  CopyToIntakeDialog,
  DeleteDialog,
  ExpireDialog,
} from "@/components/fee-structure/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 20;
/** Roles holding crm:fee-structures.manage: Super Admin (1) + Admin (7). */
const MANAGE_ROLE_IDS = new Set([1, 7]);

const strish = fallback(
  z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  undefined,
);

const searchSchema = z.object({
  q: strish,
  university_id: strish,
  course_id: strish,
  intake_id: strish,
  status: fallback(z.enum(["draft", "active", "expired"]).optional(), undefined),
  fee_collection_model: fallback(
    z.enum(["upcarrera_collects", "university_collects"]).optional(),
    undefined,
  ),
  fee_min: strish,
  fee_max: strish,
  sort: fallback(
    z.enum(["created_desc", "created_asc", "total_desc", "total_asc", "code_asc", "code_desc"]).optional(),
    undefined,
  ),
  page: fallback(z.coerce.number().int().min(1).optional(), undefined),
});

export const Route = createFileRoute("/universities/fee-structure")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Fee Structures — upCarrera" }] }),
  component: FeeStructuresPage,
});

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

function FeeStructuresPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const user = getUser();
  const canManage = user?.role_id != null && MANAGE_ROLE_IDS.has(user.role_id);

  const page = search.page ?? 1;

  // Debounced free-text search -> URL.
  const [draft, setDraft] = useState(search.q ?? "");
  useEffect(() => setDraft(search.q ?? ""), [search.q]);
  const debounced = useDebouncedValue(draft);
  useEffect(() => {
    if (debounced !== (search.q ?? "")) {
      navigate({ search: (prev) => ({ ...prev, q: debounced || undefined, page: undefined }) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const universities = useUniversityOptions();
  const courses = useCourseOptions(search.university_id ?? null, { strict: true });
  const intakes = useQuery({ queryKey: ["intakes", "v2"], queryFn: listIntakes });
  const intakeOptions = intakes.data?.items ?? [];

  const listParams = useMemo<ListFeeStructuresParams>(
    () => ({
      page,
      limit: PAGE_SIZE,
      q: search.q || undefined,
      university_id: search.university_id ? Number(search.university_id) : undefined,
      course_id: search.course_id ? Number(search.course_id) : undefined,
      intake_id: search.intake_id ? Number(search.intake_id) : undefined,
      status: search.status,
      fee_collection_model: search.fee_collection_model,
      fee_min: search.fee_min ? Number(search.fee_min) : undefined,
      fee_max: search.fee_max ? Number(search.fee_max) : undefined,
      sort: search.sort,
    }),
    [search, page],
  );

  const query = useQuery({
    queryKey: feeStructureKeys.list(listParams),
    queryFn: () => listFeeStructures(listParams),
    placeholderData: (prev) => prev,
  });

  const data = query.data;
  const counts = data?.counts ?? { draft: 0, active: 0, expired: 0 };
  const total = data?.total ?? 0;
  const totalAll = counts.draft + counts.active + counts.expired;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.items ?? [];

  const setFilter = (partial: Record<string, string | undefined>) =>
    navigate({ search: (prev) => ({ ...prev, ...partial, page: undefined }) });

  const setStatus = (next: "draft" | "active" | "expired" | undefined) =>
    navigate({ search: (prev) => ({ ...prev, status: next, page: undefined }) });

  const setPage = (p: number) =>
    navigate({ search: (prev) => ({ ...prev, page: p <= 1 ? undefined : p }) });

  const resetFilters = () => navigate({ search: () => ({}) });

  // Dialog state.
  const [copyIntakeOpen, setCopyIntakeOpen] = useState(false);
  const [expireTarget, setExpireTarget] = useState<FeeStructureListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeStructureListItem | null>(null);
  const [copyPickerTarget, setCopyPickerTarget] = useState<FeeStructureListItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: feeStructureKeys.all });

  const activateMut = useMutation({
    mutationFn: (id: number) => activateFeeStructure(id),
    onSuccess: (res) => {
      invalidate();
      toast.success(`${res.code ?? "Fee structure"} activated.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // MEDIUM-3: try to auto-resolve the next intake; when the server cannot (no later
  // intake, or it would collide with the source), fall back to the explicit picker
  // instead of just toasting an error, so the action stays usable.
  const copyNextMut = useMutation({
    mutationFn: (row: FeeStructureListItem) => copyFeeStructure(row.id),
    onSuccess: (res) => {
      invalidate();
      toast.success(
        `Copied to ${res.intake_name ?? "the next intake"} as ${res.code ?? "a new draft"}.`,
      );
    },
    onError: (err, row) => {
      if (err instanceof ApiError && /later intake|pick a target|different intake/i.test(err.message)) {
        setCopyPickerTarget(row);
        return;
      }
      toast.error(errorMessage(err));
    },
  });

  const onExport = async () => {
    setExporting(true);
    try {
      await downloadFeeStructuresCsv(listParams);
      toast.success("Export ready.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const hasFilters =
    !!search.q ||
    !!search.university_id ||
    !!search.course_id ||
    !!search.intake_id ||
    !!search.status ||
    !!search.fee_collection_model ||
    !!search.fee_min ||
    !!search.fee_max;

  return (
    <div className="space-y-6 p-6">
      {/* Header + toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fee Structures</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One master per university × course × intake, with a Draft → Active → Expired lifecycle.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Export CSV
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCopyIntakeOpen(true)}>
                <Layers className="mr-1 h-4 w-4" />
                Copy intake…
              </Button>
              <Button size="sm" asChild>
                <Link to="/universities/fee-structure/new">
                  <Plus className="mr-1 h-4 w-4" />
                  New fee structure
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status cards from the server counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusCard
          label="All"
          value={totalAll}
          active={!search.status}
          onClick={() => setStatus(undefined)}
          accent="bg-foreground"
        />
        <StatusCard
          label="Draft"
          value={counts.draft}
          active={search.status === "draft"}
          onClick={() => setStatus("draft")}
          accent="bg-slate-400"
        />
        <StatusCard
          label="Active"
          value={counts.active}
          active={search.status === "active"}
          onClick={() => setStatus("active")}
          accent="bg-emerald-500"
        />
        <StatusCard
          label="Expired"
          value={counts.expired}
          active={search.status === "expired"}
          onClick={() => setStatus("expired")}
          accent="bg-rose-500"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4 text-muted-foreground" /> Filters
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Code, university or course"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </div>
            </div>
            <FilterSelect
              label="University"
              value={search.university_id ?? "all"}
              onChange={(v) => setFilter({ university_id: v, course_id: undefined })}
              placeholder="All universities"
              options={universities.options}
            />
            <FilterSelect
              label="Course"
              value={search.course_id ?? "all"}
              onChange={(v) => setFilter({ course_id: v })}
              placeholder="All courses"
              options={courses.options}
            />
            <FilterSelect
              label="Intake"
              value={search.intake_id ?? "all"}
              onChange={(v) => setFilter({ intake_id: v })}
              placeholder="All intakes"
              options={intakeOptions.map((i) => ({ value: String(i.id), label: i.name ?? `Intake #${i.id}` }))}
            />
            <FilterSelect
              label="Collection model"
              value={search.fee_collection_model ?? "all"}
              onChange={(v) => setFilter({ fee_collection_model: v })}
              placeholder="Any model"
              options={[
                { value: "upcarrera_collects", label: "upCarrera collects" },
                { value: "university_collects", label: "University collects" },
              ]}
            />
            <div className="space-y-1">
              <Label className="text-xs">Total fee (₹)</Label>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="Min"
                  defaultValue={search.fee_min ?? ""}
                  onBlur={(e) => setFilter({ fee_min: e.target.value || undefined })}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  inputMode="numeric"
                  placeholder="Max"
                  defaultValue={search.fee_max ?? ""}
                  onBlur={(e) => setFilter({ fee_max: e.target.value || undefined })}
                />
              </div>
            </div>
            <FilterSelect
              label="Sort"
              value={search.sort ?? "created_desc"}
              onChange={(v) => setFilter({ sort: v === "created_desc" ? undefined : v })}
              placeholder="Newest first"
              includeAll={false}
              options={[
                { value: "created_desc", label: "Newest first" },
                { value: "created_asc", label: "Oldest first" },
                { value: "total_desc", label: "Total fee ↓" },
                { value: "total_asc", label: "Total fee ↑" },
                { value: "code_asc", label: "Code A–Z" },
              ]}
            />
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                onClick={resetFilters}
                disabled={!hasFilters}
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="max-h-[640px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>University</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Intake</TableHead>
                <TableHead className="text-right">Total fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {query.isError && !query.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <span className="inline-flex items-center gap-2 text-rose-600">
                      <AlertTriangle className="h-4 w-4" />
                      Couldn&apos;t load fee structures. Please try again.
                    </span>
                  </TableCell>
                </TableRow>
              )}
              {!query.isLoading &&
                !query.isError &&
                rows.map((row, i) => (
                  <FeeRow
                    key={row.id}
                    row={row}
                    index={(page - 1) * PAGE_SIZE + i + 1}
                    canManage={canManage}
                    onActivate={() => activateMut.mutate(row.id)}
                    onCopyNext={() => copyNextMut.mutate(row)}
                    onExpire={() => setExpireTarget(row)}
                    onDelete={() => setDeleteTarget(row)}
                    busy={
                      (activateMut.isPending && activateMut.variables === row.id) ||
                      (copyNextMut.isPending && copyNextMut.variables?.id === row.id)
                    }
                  />
                ))}
              {!query.isLoading && !query.isError && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center">
                    <div className="mx-auto max-w-sm space-y-2">
                      <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/60" />
                      <p className="font-medium">No fee structures yet</p>
                      <p className="text-sm text-muted-foreground">
                        {hasFilters
                          ? "No structures match these filters."
                          : "Create one to set registration and course fees for an intake."}
                      </p>
                      {canManage && !hasFilters && (
                        <Button size="sm" asChild className="mt-1">
                          <Link to="/universities/fee-structure/new">
                            <Plus className="mr-1 h-4 w-4" /> New fee structure
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="text-xs text-muted-foreground">
            {total > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
              : "No results"}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <CopyIntakeDialog open={copyIntakeOpen} onClose={() => setCopyIntakeOpen(false)} />
      <CopyToIntakeDialog
        item={copyPickerTarget}
        open={!!copyPickerTarget}
        onClose={() => setCopyPickerTarget(null)}
      />
      <ExpireDialog item={expireTarget} open={!!expireTarget} onClose={() => setExpireTarget(null)} />
      <DeleteDialog item={deleteTarget} open={!!deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function StatusCard({
  label,
  value,
  active,
  onClick,
  accent,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 text-left transition-all hover:shadow-sm",
        active ? "border-foreground/40 ring-1 ring-foreground/20" : "border-border",
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1", accent)} />
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </button>
  );
}

interface Option {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
  includeAll = true,
}: {
  label: string;
  value: string;
  onChange: (v: string | undefined) => void;
  placeholder: string;
  options: Option[];
  includeAll?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v === "all" ? undefined : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="all">{placeholder}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FeeRow({
  row,
  index,
  canManage,
  onActivate,
  onCopyNext,
  onExpire,
  onDelete,
  busy,
}: {
  row: FeeStructureListItem;
  index: number;
  canManage: boolean;
  onActivate: () => void;
  onCopyNext: () => void;
  onExpire: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const detailLink = { to: "/universities/fee-structure/$id", params: { id: String(row.id) } } as const;
  // LOW-9: the server gate stays the source of truth, but disable the row Activate
  // when the cheap per-row check says it would be rejected, with the first reason as
  // its tooltip. Defaults to enabled if the field is missing (older API payloads).
  const activationOk = row.activation?.ok ?? true;
  const activationReason = row.activation?.reasons?.[0];
  return (
    <TableRow>
      <TableCell className="text-sm tabular-nums text-muted-foreground">{index}</TableCell>
      <TableCell className="font-medium">
        <Link {...detailLink} className="hover:underline">
          {row.code ?? `#${row.id}`}
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span>{row.university_title ?? `University #${row.university_id}`}</span>
          <CollectionModelBadge model={row.fee_collection_model} universityId={row.university_id} />
        </div>
      </TableCell>
      <TableCell className="max-w-[220px] truncate">{row.course_title ?? `Course #${row.course_id}`}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="text-sm">{row.intake_name ?? `Intake #${row.intake_id}`}</span>
          <IntakeStatusBadge status={row.intake_status} />
        </div>
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatInr(row.total_fee)}</TableCell>
      <TableCell>
        <StatusChip status={row.status} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" asChild>
            <Link {...detailLink}>
              <Eye className="h-4 w-4" />
              <span className="sr-only">View</span>
            </Link>
          </Button>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link {...detailLink}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Link>
                </DropdownMenuItem>
                {row.status === "draft" && (
                  <DropdownMenuItem
                    onClick={activationOk ? onActivate : undefined}
                    disabled={!activationOk}
                    title={!activationOk ? activationReason : undefined}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Activate
                  </DropdownMenuItem>
                )}
                {row.status === "active" && (
                  <DropdownMenuItem onClick={onExpire}>
                    <Ban className="mr-2 h-4 w-4" /> Expire
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onCopyNext}>
                  <CopyPlus className="mr-2 h-4 w-4" /> Copy to next intake
                </DropdownMenuItem>
                {row.status === "draft" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-rose-600 focus:text-rose-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
