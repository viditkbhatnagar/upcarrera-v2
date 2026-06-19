import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Download,
  Search,
  Eye,
  FileText,
  Wallet,
  IndianRupee,
  Percent,
  AlertTriangle,
  Loader2,
  Receipt,
  Activity,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatINR, UNIVERSITIES, COURSES, BATCHES } from "@/lib/students-data";

export const Route = createFileRoute("/fees/summary")({
  head: () => ({
    meta: [
      { title: "Student Fee Summary — upCarrera" },
      {
        name: "description",
        content:
          "Complete student fee ledger with payments, installments, receipts, and activity timeline.",
      },
    ],
  }),
  component: FeeSummary,
});

// --- Live API wiring (GET /api/students/finance) -------------------------
// Each item is the raw `users` row (id, name, email, phone, register_number,
// code, university_id …) spread by the API and layered with the student's
// finance row fields: tuitionFees / examFees / miscFees / scholarship_details /
// payment_status (all null when the student has no finance row yet). The
// endpoint now also joins display names — university_title (university),
// course_title (course) and session_title (intake) — which fill the previously
// blank columns. It still carries NO paid / outstanding / installment / receipt
// data, so those remain rendered "—" / 0 / empty rather than fabricated. Source
// of truth: StudentsService.listFinance (apps/api/src/students/students.service.ts).
const EMPTY = "—";

type PaymentStatusRaw = string | null;

interface ApiFinanceRow {
  id: number | string;
  name: string | null;
  email: string | null;
  phone: string | null;
  register_number: string | null;
  code: number | string | null;
  university_id: number | string | null;
  finance_id: number | string | null;
  tuitionFees: number | null;
  examFees: number | null;
  miscFees: number | null;
  scholarship_details: string | null;
  payment_status: PaymentStatusRaw;
  // Decorated display fields (joined server-side).
  university_title: string | null;
  course_title: string | null;
  session_title: string | null;
}

interface FinanceListResponse {
  items: ApiFinanceRow[];
  total: number;
  page: number;
  limit: number;
}

// ---------- Types ----------
type FeeStatus = "Fully Paid" | "Partially Paid" | "Due Soon" | "Overdue";

interface SummaryRow {
  rowId: string;
  id: string;
  name: string;
  university: string;
  course: string;
  intake: string;
  tuitionFees: number;
  examFees: number;
  miscFees: number;
  scholarshipDetails: string;
  totalFee: number;
  paid: number;
  outstanding: number | null; // null when API provides no paid figure
  nextDue: string;
  paymentStatus: string;
  status: FeeStatus;
}

const STATUS_STYLES: Record<FeeStatus, string> = {
  "Fully Paid": "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  "Partially Paid": "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
  "Due Soon": "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  Overdue: "bg-red-100 text-red-700 ring-1 ring-red-200",
};

function asText(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function toNum(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// Map the free-text finance.payment_status onto the UI badge union. Anything we
// don't recognise falls back to "Partially Paid" so styling still resolves.
function toFeeStatus(raw: PaymentStatusRaw): FeeStatus {
  const s = (raw ?? "").trim().toLowerCase();
  if (["paid", "fully paid", "complete", "completed", "success"].includes(s)) return "Fully Paid";
  if (["overdue", "due", "unpaid", "pending"].includes(s)) return "Overdue";
  if (["due soon", "upcoming"].includes(s)) return "Due Soon";
  return "Partially Paid";
}

function mapApiRow(r: ApiFinanceRow): SummaryRow {
  const tuition = toNum(r.tuitionFees);
  const exam = toNum(r.examFees);
  const misc = toNum(r.miscFees);
  const totalFee = tuition + exam + misc;
  const displayId =
    r.register_number != null && String(r.register_number).trim() !== ""
      ? String(r.register_number)
      : r.code != null && String(r.code).trim() !== ""
        ? String(r.code)
        : `STU-${r.id}`;
  return {
    rowId: String(r.id),
    id: displayId,
    name: asText(r.name),
    // listFinance now joins display names for university / course / intake.
    university: asText(r.university_title),
    course: asText(r.course_title),
    intake: asText(r.session_title),
    tuitionFees: tuition,
    examFees: exam,
    miscFees: misc,
    scholarshipDetails: asText(r.scholarship_details),
    totalFee,
    paid: 0, // endpoint provides no paid amount
    outstanding: null, // unknown without a paid figure
    nextDue: EMPTY,
    paymentStatus: asText(r.payment_status),
    status: toFeeStatus(r.payment_status),
  };
}

const PAGE_SIZE = 50;

// ---------- Component ----------
function FeeSummary() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uniFilter, setUniFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [intakeFilter, setIntakeFilter] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [activeStudent, setActiveStudent] = useState<SummaryRow | null>(null);

  // Live student finance list. Pagination/date/university_id are supported
  // server-side; the text + dropdown filters below refine the fetched page over
  // the real decorated values.
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["students", "finance", { page: 1, limit: PAGE_SIZE }],
    queryFn: () => apiGet<FinanceListResponse>("/students/finance", { page: 1, limit: PAGE_SIZE }),
  });

  const allRows = useMemo(() => (data?.items ?? []).map(mapApiRow), [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (q && !`${r.name} ${r.id}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (uniFilter !== "all" && r.university !== uniFilter) return false;
      if (courseFilter !== "all" && r.course !== courseFilter) return false;
      if (intakeFilter !== "all" && r.intake !== intakeFilter) return false;
      return true;
    });
  }, [allRows, query, statusFilter, uniFilter, courseFilter, intakeFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.total += r.totalFee;
        acc.paid += r.paid;
        if (r.outstanding != null) {
          acc.out += r.outstanding;
          acc.hasOut = true;
        }
        return acc;
      },
      { total: 0, paid: 0, out: 0, hasOut: false },
    );
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Student Fee Summary</h1>
          <p className="text-sm text-muted-foreground">
            View complete student fee ledger, payments and receipts.
          </p>
        </div>
        <Button onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Students" value={String(filtered.length)} icon={Activity} />
        <KpiCard label="Total Receivable" value={formatINR(totals.total)} icon={IndianRupee} />
        <KpiCard label="Collected" value={formatINR(totals.paid)} icon={Wallet} />
        <KpiCard
          label="Outstanding"
          value={totals.hasOut ? formatINR(totals.out) : EMPTY}
          icon={AlertTriangle}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or Student ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder="Fee Status" options={["Fully Paid", "Partially Paid", "Due Soon", "Overdue"]} />
          <FilterSelect value={uniFilter} onChange={setUniFilter} placeholder="University" options={UNIVERSITIES} />
          <div className="grid grid-cols-2 gap-3">
            <FilterSelect value={courseFilter} onChange={setCourseFilter} placeholder="Course" options={COURSES} />
            <FilterSelect value={intakeFilter} onChange={setIntakeFilter} placeholder="Intake" options={BATCHES} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Fee Ledger
            {isFetching && !isLoading && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground/60 align-text-bottom" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>University</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Intake</TableHead>
                <TableHead className="text-right">Total Fee</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
                      <div className="text-sm text-muted-foreground">Loading fee ledger…</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertTriangle className="h-8 w-8 text-red-500/60" />
                      <div className="text-sm font-medium text-foreground">Couldn’t load fee ledger</div>
                      <div className="text-xs text-muted-foreground">
                        {error instanceof Error ? error.message : "Please try again."}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-10">
                    No matching students.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.rowId}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">{r.university}</TableCell>
                    <TableCell className="text-sm">{r.course}</TableCell>
                    <TableCell className="text-sm">{r.intake}</TableCell>
                    <TableCell className="text-right">{formatINR(r.totalFee)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatINR(r.paid)}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {r.outstanding != null ? formatINR(r.outstanding) : EMPTY}
                    </TableCell>
                    <TableCell className="text-sm">{r.nextDue}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setActiveStudent(r)}>
                        <Eye className="h-3.5 w-3.5" /> View Ledger
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} count={filtered.length} />
      <ProfileDrawer student={activeStudent} onClose={() => setActiveStudent(null)} />
    </div>
  );
}

// ---------- Sub-components ----------
function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-semibold">{value}</div>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ExportModal({ open, onClose, count }: { open: boolean; onClose: () => void; count: number }) {
  const [format, setFormat] = useState("xlsx");
  const [scope, setScope] = useState("filtered");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Fee Summary</DialogTitle>
          <DialogDescription>Download student-wise fee ledger.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="filtered">Filtered results ({count})</SelectItem>
                <SelectItem value="all">All students</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              toast.success(`Export queued as ${format.toUpperCase()}`);
              onClose();
            }}
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileDrawer({ student, onClose }: { student: SummaryRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!student} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg">{student?.name}</DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{student?.id}</span>
                <span>•</span>
                <span>{student?.university}</span>
                <span>•</span>
                <span>{student?.course} — {student?.intake}</span>
                {student && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[student.status]}`}>{student.status}</span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </DialogHeader>
        <div className="py-4">
          {student && <ProfileTabs row={student} />}
        </div>
        <DialogFooter className="border-t pt-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => toast.success("Statement downloaded")}>
              <Download className="h-4 w-4" /> Download Statement
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileTabs({ row }: { row: SummaryRow }) {
  const outstandingLabel = row.outstanding != null ? formatINR(row.outstanding) : EMPTY;
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="structure">Fee Structure</TabsTrigger>
        <TabsTrigger value="installments">Installments</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>

      {/* Overview */}
      <TabsContent value="overview" className="mt-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat label="Total Fee" value={formatINR(row.totalFee)} />
          <MiniStat label="Discount" value={EMPTY} />
          <MiniStat label="Scholarship" value={row.scholarshipDetails} />
          <MiniStat label="Net Fee" value={formatINR(row.totalFee)} />
          <MiniStat label="Paid Amount" value={formatINR(row.paid)} tone="success" />
          <MiniStat label="Outstanding" value={outstandingLabel} tone="danger" />
          <MiniStat label="Payment Status" value={row.paymentStatus} tone="primary" />
          <MiniStat label="Next Due Date" value={row.nextDue} />
        </div>
      </TabsContent>

      {/* Fee Structure */}
      <TabsContent value="structure" className="mt-4">
        <Card>
          <CardContent className="p-4 text-sm">
            <dl className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
              <DefItem label="Tuition Fee" value={formatINR(row.tuitionFees)} />
              <DefItem label="Registration" value={EMPTY} />
              <DefItem label="Exam Fee" value={formatINR(row.examFees)} />
              <DefItem label="Misc / Library" value={formatINR(row.miscFees)} />
              <DefItem label="Discount" value={EMPTY} />
              <DefItem label="Scholarship" value={row.scholarshipDetails} />
              <DefItem label="Net Payable" value={formatINR(row.totalFee)} highlight />
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Installments (merged with payment history) */}
      <TabsContent value="installments" className="mt-4">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-10">
                    No installment schedule available.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Activity */}
      <TabsContent value="activity" className="mt-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground/40" />
              <div className="text-sm text-muted-foreground">No activity recorded.</div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "primary" }) {
  const toneCls =
    tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-red-600" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-semibold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function DefItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "col-span-2 border-t pt-3 md:col-span-4" : ""}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 ${highlight ? "text-base font-semibold" : "text-sm font-medium"}`}>{value}</dd>
    </div>
  );
}

// keep import used
const _used = [Percent, FileText];
void _used;
