import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

const UNIVERSITIES = [
  { name: "Manipal State University", code: "MSU", type: "Type 1" as UniversityType },
  { name: "Amity Online University", code: "AOU", type: "Type 2" as UniversityType },
  { name: "Jain Deemed University", code: "JDU", type: "Type 1" as UniversityType },
  { name: "LPU Online", code: "LPU", type: "Type 2" as UniversityType },
  { name: "NMIMS Global", code: "NMG", type: "Type 1" as UniversityType },
  { name: "DY Patil University", code: "DYP", type: "Type 2" as UniversityType },
];

const GROUPS = ["MBA", "BBA", "MCA", "BCA", "M.Com", "B.Com"];
const SPECS = ["Finance", "Marketing", "HR", "Operations", "IT", "Analytics", "General"];
const INTAKES = ["January 2026 Intake", "April 2026 Intake", "July 2026 Intake", "October 2026 Intake"];
const STATUSES: FeeStatus[] = ["Active", "Draft", "Inactive", "Expired"];

function seed(): FeeStructure[] {
  const out: FeeStructure[] = [];
  let r = 73;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 38; i++) {
    const u = UNIVERSITIES[Math.floor(rnd() * UNIVERSITIES.length)];
    const g = GROUPS[Math.floor(rnd() * GROUPS.length)];
    const s = SPECS[Math.floor(rnd() * SPECS.length)];
    const intake = INTAKES[Math.floor(rnd() * INTAKES.length)];
    const status = STATUSES[Math.floor(rnd() * STATUSES.length)];
    const reg = [5000, 10000, 12000, 15000][Math.floor(rnd() * 4)];
    const total = Math.floor(rnd() * 250000) + 80000;
    const net = total - Math.floor(rnd() * 20000);
    const day = Math.floor(rnd() * 28) + 1;
    const mon = Math.floor(rnd() * 6) + 1;
    out.push({
      id: `FEE-${String(1450 + i).padStart(4, "0")}`,
      university: u.name,
      universityCode: u.code,
      universityType: u.type,
      course: `${g} in ${s}`,
      specialisation: s,
      group: g,
      intake,
      registrationFee: reg,
      totalFee: total,
      netPayable: net,
      installmentEnabled: rnd() > 0.3,
      status,
      createdDate: `2026-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  return out;
}

const ALL: FeeStructure[] = seed();

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
  const d = new Date(iso);
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
  }, [q, uniQ, course, spec, intake, type, status, feeMin, feeMax, sortKey, sortDir]);

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
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <Button size="sm" onClick={() => { setPage(1); toast.success("Filters applied"); }}>
              <Filter /> Apply Filters
            </Button>
            <Button size="sm" variant="outline" onClick={resetFilters}>
              <RotateCcw /> Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toast.success("View saved")}>
              <Save /> Save View
            </Button>
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
              {pageRows.map((f) => (
                <TableRow key={f.id}>
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
                      <Button size="sm" variant="ghost" onClick={() => setViewing(f)}>
                        <Eye /> View
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-12">
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
            <DialogDescription>Read-only view. Edits are managed from the University Profile.</DialogDescription>
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
