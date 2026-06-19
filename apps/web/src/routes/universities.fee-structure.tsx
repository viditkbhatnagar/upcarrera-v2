import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Download,
  Search,
  Eye,
  Save,
  RotateCcw,
  Filter,
  Columns3,
  ChevronLeft,
  ChevronRight,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/universities/fee-structure")({
  head: () => ({ meta: [{ title: "Fee Structures — upCarrera" }] }),
  component: FeeStructuresPage,
});

type FeeStatus = "Active" | "Draft" | "Inactive" | "Expired";
type UniversityType = "Type 1" | "Type 2";

type FeeStructure = {
  id: string;
  university: string;
  universityCode: string;
  universityType: UniversityType;
  course: string;
  specialisation: string;
  group: string;
  intake: string;
  registrationFee: number;
  totalFee: number;
  netPayable: number;
  installmentEnabled: boolean;
  status: FeeStatus;
  createdDate: string; // ISO
};

// --- Live API wiring -------------------------------------------------------
// There is no dedicated "fee structures" endpoint. Each course carries its own
// fee definition, so the fee-structure list is sourced from GET /api/courses
// ({ items, total, page, limit }) and decorated with the owning university's
// name/code via GET /api/universities. Fields the schema doesn't carry
// (intake, a distinct net-payable, the Type 1/Type 2 payment model) are
// derived with sensible fallbacks — see mapCourseToFee below.
const PAGE_SIZE = 100;

interface ApiCourseRow {
  id: number | string;
  title: string | null;
  short_name: string | null;
  stream: string | null;
  level: string | null;
  specialisations: string | null;
  payment_mode: string | null;
  emi_facility: number | string | boolean | null;
  total_amount: number | string | null;
  fee_structure: number | string | null;
  study_mode: string | null;
  university_id: number | string | null;
  status: number | string | null;
  created_at: string | null;
}

interface ApiUniversityRow {
  id: number | string;
  title: string | null;
  category: string | null;
}

// Pull a numeric amount out of a possibly-string / possibly-null column.
function toAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Legacy course.status is typically 1 (active) / 0 (inactive); the screen has a
// richer status vocabulary, so map what we can and bucket the rest to Draft.
function mapCourseStatus(value: number | string | null): FeeStatus {
  if (value === null || value === undefined) return "Draft";
  const v = String(value).trim().toLowerCase();
  if (v === "1" || v === "active" || v === "true") return "Active";
  if (v === "0" || v === "inactive" || v === "false") return "Inactive";
  if (v === "expired") return "Expired";
  return "Draft";
}

// university.category is a free-text column; treat a "type 2"-ish label as the
// student-pays-upCarrera model and everything else as Type 1.
function mapUniversityType(category: string | null | undefined): UniversityType {
  return category && category.toLowerCase().includes("2") ? "Type 2" : "Type 1";
}

// Build an MSU-style 3-letter code from a university title.
function deriveCode(title: string | null | undefined, id: number | string): string {
  if (!title?.trim()) return `U${String(id).padStart(2, "0")}`;
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters = (words.length >= 2 ? words.map((w) => w[0]).join("") : title.trim())
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return letters.slice(0, 3) || `U${String(id).padStart(2, "0")}`;
}

function mapCourseToFee(
  r: ApiCourseRow,
  uni: ApiUniversityRow | undefined,
): FeeStructure {
  const total = toAmount(r.total_amount) || toAmount(r.fee_structure);
  // payment_mode often encodes the registration/booking amount; fall back to
  // fee_structure when it isn't a parseable number.
  const reg = toAmount(r.payment_mode) || toAmount(r.fee_structure);
  // No separate net-payable column exists; net payable == total fee.
  const net = total;
  const uniTitle = uni?.title?.trim() ? String(uni.title) : `University #${r.university_id ?? "—"}`;
  const installment =
    r.emi_facility === true ||
    String(r.emi_facility ?? "").trim().toLowerCase() === "1" ||
    String(r.emi_facility ?? "").trim().toLowerCase() === "yes" ||
    String(r.emi_facility ?? "").trim().toLowerCase() === "true";
  return {
    id: r.short_name?.trim() ? String(r.short_name) : `FEE-${String(r.id).padStart(4, "0")}`,
    university: uniTitle,
    universityCode: deriveCode(uni?.title, r.university_id ?? r.id),
    universityType: mapUniversityType(uni?.category),
    course: r.title?.trim() ? String(r.title) : `Course #${r.id}`,
    specialisation: r.specialisations?.trim() ? String(r.specialisations) : "—",
    // No "group" column on courses; reuse the stream/level as the group label.
    group: r.stream?.trim() ? String(r.stream) : r.level?.trim() ? String(r.level) : "—",
    // No intake/session is attached to a course's fee definition.
    intake: r.study_mode?.trim() ? String(r.study_mode) : "—",
    registrationFee: reg,
    totalFee: total,
    netPayable: net,
    installmentEnabled: installment,
    status: mapCourseStatus(r.status),
    createdDate: r.created_at ? String(r.created_at).slice(0, 10) : "",
  };
}

// Status vocabulary is a fixed enum on this screen (not sourced from the API).
const STATUSES: FeeStatus[] = ["Active", "Draft", "Inactive", "Expired"];

const STATUS_STYLES: Record<FeeStatus, string> = {
  Active: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Draft: "bg-slate-100 text-slate-700 ring-slate-200",
  Inactive: "bg-orange-100 text-orange-700 ring-orange-200",
  Expired: "bg-red-100 text-red-700 ring-red-200",
};

const TYPE_STYLES: Record<UniversityType, string> = {
  "Type 1": "bg-primary/10 text-primary ring-primary/20",
  "Type 2": "bg-violet-100 text-violet-700 ring-violet-200",
};

const TYPE_LABEL: Record<UniversityType, string> = {
  "Type 1": "Type 1 · Student Pays University",
  "Type 2": "Type 2 · Student Pays upCarrera",
};

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
};

type ColumnKey =
  | "id"
  | "university"
  | "course"
  | "intake"
  | "type"
  | "regFee"
  | "totalFee"
  | "netPayable"
  | "installment"
  | "status"
  | "created"
  | "action";

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "id", label: "Fee Structure ID" },
  { key: "university", label: "University" },
  { key: "course", label: "Course" },
  { key: "intake", label: "Intake" },
  { key: "type", label: "University Type" },
  { key: "regFee", label: "Registration Fee" },
  { key: "totalFee", label: "Total Fee" },
  { key: "netPayable", label: "Net Payable" },
  { key: "installment", label: "Installment" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created Date" },
  { key: "action", label: "Action" },
];

function FeeStructuresPage() {
  const [q, setQ] = useState("");
  const [uniQ, setUniQ] = useState("");
  const [course, setCourse] = useState("all");
  const [spec, setSpec] = useState("all");
  const [intake, setIntake] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [feeMin, setFeeMin] = useState("");
  const [feeMax, setFeeMax] = useState("");
  const [sortKey, setSortKey] = useState<ColumnKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleCols, setVisibleCols] = useState<Record<ColumnKey, boolean>>({
    id: true, university: true, course: true, intake: true, type: true,
    regFee: true, totalFee: true, netPayable: true, installment: true,
    status: true, created: true, action: true,
  });
  const [viewing, setViewing] = useState<FeeStructure | null>(null);
  const [editing, setEditing] = useState<FeeStructure | null>(null);

  // Each course IS a fee structure; universities are fetched to resolve names.
  const coursesQuery = useQuery({
    queryKey: ["fee-structures-courses", { page: 1, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<{ items: ApiCourseRow[]; total: number; page: number; limit: number }>("/courses", {
        page: 1,
        limit: PAGE_SIZE,
      }),
  });
  const universitiesQuery = useQuery({
    queryKey: ["fee-structures-universities", { page: 1, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<{ items: ApiUniversityRow[]; total: number; page: number; limit: number }>(
        "/universities",
        { page: 1, limit: PAGE_SIZE },
      ),
  });

  const isLoading = coursesQuery.isLoading || universitiesQuery.isLoading;
  const isError = coursesQuery.isError;

  // Mapped live rows. Local edits (Edit dialog) are layered on top via `ALL`.
  const mapped = useMemo<FeeStructure[]>(() => {
    const uniById = new Map<string, ApiUniversityRow>(
      (universitiesQuery.data?.items ?? []).map((u) => [String(u.id), u]),
    );
    return (coursesQuery.data?.items ?? []).map((c) =>
      mapCourseToFee(c, uniById.get(String(c.university_id))),
    );
  }, [coursesQuery.data, universitiesQuery.data]);

  const [ALL, setALL] = useState<FeeStructure[]>([]);
  useEffect(() => {
    setALL(mapped);
  }, [mapped]);

  // Filter option lists derived from the live rows (the API has no static
  // enums for course group / specialisation / intake).
  const GROUPS = useMemo(
    () => Array.from(new Set(ALL.map((f) => f.group).filter((g) => g && g !== "—"))).sort(),
    [ALL],
  );
  const SPECS = useMemo(
    () => Array.from(new Set(ALL.map((f) => f.specialisation).filter((s) => s && s !== "—"))).sort(),
    [ALL],
  );
  const INTAKES = useMemo(
    () => Array.from(new Set(ALL.map((f) => f.intake).filter((i) => i && i !== "—"))).sort(),
    [ALL],
  );

  const filtered = useMemo(() => {
    let rows = ALL.filter((f) => {
      if (q && !f.id.toLowerCase().includes(q.toLowerCase())) return false;
      if (uniQ && !f.university.toLowerCase().includes(uniQ.toLowerCase())) return false;
      if (course !== "all" && f.group !== course) return false;
      if (spec !== "all" && f.specialisation !== spec) return false;
      if (intake !== "all" && f.intake !== intake) return false;
      if (type !== "all" && f.universityType !== type) return false;
      if (status !== "all" && f.status !== status) return false;
      if (feeMin && f.totalFee < Number(feeMin)) return false;
      if (feeMax && f.totalFee > Number(feeMax)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const va: string | number =
        sortKey === "regFee" ? a.registrationFee :
        sortKey === "totalFee" ? a.totalFee :
        sortKey === "netPayable" ? a.netPayable :
        sortKey === "created" ? a.createdDate :
        sortKey === "university" ? a.university :
        sortKey === "course" ? a.course :
        sortKey === "intake" ? a.intake :
        sortKey === "type" ? a.universityType :
        sortKey === "status" ? a.status :
        a.id;
      const vb: string | number =
        sortKey === "regFee" ? b.registrationFee :
        sortKey === "totalFee" ? b.totalFee :
        sortKey === "netPayable" ? b.netPayable :
        sortKey === "created" ? b.createdDate :
        sortKey === "university" ? b.university :
        sortKey === "course" ? b.course :
        sortKey === "intake" ? b.intake :
        sortKey === "type" ? b.universityType :
        sortKey === "status" ? b.status :
        b.id;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return rows;
  }, [q, uniQ, course, spec, intake, type, status, feeMin, feeMax, sortKey, sortDir, ALL]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const resetFilters = () => {
    setQ(""); setUniQ(""); setCourse("all"); setSpec("all"); setIntake("all");
    setType("all"); setStatus("all"); setFeeMin(""); setFeeMax(""); setPage(1);
    toast.success("Filters reset");
  };

  const toggleSort = (k: ColumnKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const exportCsv = () => {
    const headers = ["ID","University","Course","Intake","Type","Registration","Total","Net Payable","Installment","Status","Created"];
    const rows = filtered.map((f) => [
      f.id, f.university, f.course, f.intake, f.universityType,
      f.registrationFee, f.totalFee, f.netPayable,
      f.installmentEnabled ? "Yes" : "No", f.status, fmtDate(f.createdDate),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "fee-structures.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fee Structures</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and compare all fee structures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>Export to Excel (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.message("PDF export queued")}>Export to PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4 text-muted-foreground" /> Advanced Filters
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fee Structure ID</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="FEE-1450" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">University</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search university" value={uniQ} onChange={(e) => setUniQ(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Course (Group)</Label>
              <Select value={course} onValueChange={setCourse}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Specialisation</Label>
              <Select value={spec} onValueChange={setSpec}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Specialisations</SelectItem>
                  {SPECS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Intake</Label>
              <Select value={intake} onValueChange={setIntake}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Intakes</SelectItem>
                  {INTAKES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">University Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Type 1">Type 1 · Student Pays University</SelectItem>
                  <SelectItem value="Type 2">Type 2 · Student Pays upCarrera</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fee Range (₹)</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="Min" value={feeMin} onChange={(e) => setFeeMin(e.target.value)} />
                <span className="text-muted-foreground text-xs">—</span>
                <Input placeholder="Max" value={feeMax} onChange={(e) => setFeeMax(e.target.value)} />
              </div>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" onClick={resetFilters}>
                <RotateCcw /> Reset
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Columns3 /> Columns</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.key}
                      checked={visibleCols[c.key]}
                      onCheckedChange={(v) => setVisibleCols((p) => ({ ...p, [c.key]: !!v }))}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-auto max-h-[640px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="w-16">Sl No</TableHead>
                {visibleCols.id && <TableHead className="cursor-pointer" onClick={() => toggleSort("id")}>Fee Structure ID</TableHead>}
                {visibleCols.university && <TableHead className="cursor-pointer" onClick={() => toggleSort("university")}>University</TableHead>}
                {visibleCols.course && <TableHead className="cursor-pointer" onClick={() => toggleSort("course")}>Course</TableHead>}
                {visibleCols.intake && <TableHead className="cursor-pointer" onClick={() => toggleSort("intake")}>Intake</TableHead>}
                {visibleCols.type && <TableHead>Type</TableHead>}
                {visibleCols.regFee && <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("regFee")}>Registration Fee</TableHead>}
                {visibleCols.totalFee && <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("totalFee")}>Total Fee</TableHead>}
                {visibleCols.netPayable && <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("netPayable")}>Net Payable</TableHead>}
                {visibleCols.installment && <TableHead>Installment</TableHead>}
                {visibleCols.status && <TableHead>Status</TableHead>}
                {visibleCols.created && <TableHead className="cursor-pointer" onClick={() => toggleSort("created")}>Created</TableHead>}
                {visibleCols.action && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-12">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && isError && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-12">
                    <span className="inline-flex items-center gap-2 text-rose-600">
                      <AlertTriangle className="h-4 w-4" />
                      Couldn’t load fee structures. Please try again.
                    </span>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !isError && pageRows.map((f, i) => (
                <TableRow key={f.id}>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  {visibleCols.id && <TableCell className="font-medium">{f.id}</TableCell>}
                  {visibleCols.university && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded bg-primary/10 text-primary text-[10px] font-semibold grid place-content-center ring-1 ring-primary/20">
                          {f.universityCode}
                        </div>
                        <span>{f.university}</span>
                      </div>
                    </TableCell>
                  )}
                  {visibleCols.course && <TableCell>{f.course}</TableCell>}
                  {visibleCols.intake && <TableCell>{f.intake}</TableCell>}
                  {visibleCols.type && (
                    <TableCell>
                      <Badge variant="secondary" className={`ring-1 ${TYPE_STYLES[f.universityType]}`}>{f.universityType}</Badge>
                    </TableCell>
                  )}
                  {visibleCols.regFee && <TableCell className="text-right">{inr(f.registrationFee)}</TableCell>}
                  {visibleCols.totalFee && <TableCell className="text-right font-medium">{inr(f.totalFee)}</TableCell>}
                  {visibleCols.netPayable && <TableCell className="text-right">{inr(f.netPayable)}</TableCell>}
                  {visibleCols.installment && (
                    <TableCell>
                      <Badge variant="secondary" className={f.installmentEnabled ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"}>
                        {f.installmentEnabled ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                  )}
                  {visibleCols.status && (
                    <TableCell>
                      <Badge variant="secondary" className={`ring-1 ${STATUS_STYLES[f.status]}`}>{f.status}</Badge>
                    </TableCell>
                  )}
                  {visibleCols.created && <TableCell>{fmtDate(f.createdDate)}</TableCell>}
                  {visibleCols.action && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(f)}>
                          <Eye /> View
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && !isError && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-12">
                    No fee structures match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft />
            </Button>
            <div className="text-xs">Page {page} of {totalPages}</div>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fee Structure Details</DialogTitle>
            <DialogDescription>Read-only view of the fee structure.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-md bg-primary/10 text-primary font-semibold grid place-content-center ring-1 ring-primary/20">
                    {viewing.universityCode}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {viewing.university}
                    </div>
                    <div className="text-xs text-muted-foreground">{viewing.id}</div>
                  </div>
                </div>
                <Badge variant="secondary" className={`ring-1 ${STATUS_STYLES[viewing.status]}`}>{viewing.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Course" value={viewing.course} />
                <Field label="Specialisation" value={`${viewing.group} - ${viewing.specialisation}`} />
                <Field label="Intake" value={viewing.intake} />
                <Field label="University Type" value={TYPE_LABEL[viewing.universityType]} />
                <Field label="Registration Fee" value={inr(viewing.registrationFee)} />
                <Field label="Total Fee" value={inr(viewing.totalFee)} />
                <Field label="Net Payable Fee" value={inr(viewing.netPayable)} highlight />
                <Field label="Installment Enabled" value={viewing.installmentEnabled ? "Yes" : "No"} />
                <Field label="Created Date" value={fmtDate(viewing.createdDate)} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Fee Structure</DialogTitle>
            <DialogDescription>Update the fee structure details below.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label>University</Label>
                  <Input value={editing.university} disabled className="mt-1" />
                </div>
                <div>
                  <Label>Fee Structure ID</Label>
                  <Input value={editing.id} disabled className="mt-1" />
                </div>
                <div>
                  <Label>Course</Label>
                  <Input value={editing.course} onChange={(e) => setEditing({ ...editing, course: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Intake</Label>
                  <Select value={editing.intake} onValueChange={(v) => setEditing({ ...editing, intake: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTAKES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Registration Fee</Label>
                  <Input type="number" value={editing.registrationFee} onChange={(e) => setEditing({ ...editing, registrationFee: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label>Total Fee</Label>
                  <Input type="number" value={editing.totalFee} onChange={(e) => setEditing({ ...editing, totalFee: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label>Net Payable</Label>
                  <Input type="number" value={editing.netPayable} onChange={(e) => setEditing({ ...editing, netPayable: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as FeeStatus })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Installment Enabled</Label>
                  <Select value={editing.installmentEnabled ? "yes" : "no"} onValueChange={(v) => setEditing({ ...editing, installmentEnabled: v === "yes" })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={() => {
                  setALL((prev) => prev.map((x) => x.id === editing.id ? editing : x));
                  setEditing(null);
                  toast.success("Fee structure updated");
                }}>
                  <Save /> Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 ${highlight ? "text-base font-semibold text-primary" : "font-medium"}`}>{value}</div>
    </div>
  );
}
