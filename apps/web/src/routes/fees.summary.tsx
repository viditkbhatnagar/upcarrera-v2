import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  Search,
  Eye,
  FileText,
  Wallet,
  IndianRupee,
  Percent,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Receipt,
  Activity,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatINR, ALL_STUDENTS, UNIVERSITIES, COURSES, BATCHES } from "@/lib/students-data";

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

// ---------- Types ----------
type FeeStatus = "Fully Paid" | "Partially Paid" | "Due Soon" | "Overdue";
type PaymentMode = "UPI" | "NEFT" | "RTGS" | "Cash" | "Card" | "Cheque";
type VerifyStatus = "Verified" | "Unverified" | "Rejected";

interface Installment {
  no: number;
  due: string;
  amount: number;
  paid: number;
  status: "Paid" | "Partial" | "Pending" | "Overdue";
  // merged payment info
  receiptNo?: string;
  paidOn?: string;
  mode?: PaymentMode;
  txnId?: string;
  verification?: VerifyStatus;
}

interface Ledger {
  totalFee: number;
  discount: number;
  scholarship: number;
  netFee: number;
  paid: number;
  outstanding: number;
  collectionPct: number;
  nextDue: string;
  installments: Installment[];
  activity: { date: string; text: string; type: "payment" | "verify" | "reminder" | "system" }[];
}

interface SummaryRow {
  id: string;
  name: string;
  university: string;
  course: string;
  intake: string;
  totalFee: number;
  paid: number;
  outstanding: number;
  nextDue: string;
  status: FeeStatus;
  ledger: Ledger;
}

// ---------- Mock seed (derive from ALL_STUDENTS) ----------
const MODES: PaymentMode[] = ["UPI", "NEFT", "RTGS", "Cash", "Card", "Cheque"];

function buildLedger(total: number, paid: number, seedNum: number): Ledger {
  let s = seedNum * 31 + 7;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const discount = Math.round(total * 0.05);
  const scholarship = rnd() > 0.7 ? Math.round(total * 0.08) : 0;
  const netFee = total - discount - scholarship;
  const outstanding = Math.max(0, netFee - paid);
  const collectionPct = Math.round((paid / netFee) * 100);

  const count = 4;
  const each = Math.round(netFee / count);
  const baseMonth = ["15 Jan 2026", "15 Apr 2026", "15 Jul 2026", "15 Oct 2026"];
  let remainingPaid = paid;
  const installments: Installment[] = [];
  for (let i = 0; i < count; i++) {
    const amt = i === count - 1 ? netFee - each * (count - 1) : each;
    const p = Math.min(amt, Math.max(0, remainingPaid));
    remainingPaid -= p;
    const isPaid = p >= amt;
    const isPartial = p > 0 && p < amt;
    const overdue = !isPaid && i < 2;
    installments.push({
      no: i + 1,
      due: baseMonth[i],
      amount: amt,
      paid: p,
      status: isPaid ? "Paid" : isPartial ? "Partial" : overdue ? "Overdue" : "Pending",
      receiptNo: p > 0 ? `RCPT-${10240 + seedNum * 10 + i}` : undefined,
      paidOn: p > 0 ? baseMonth[i].replace("15", String(10 + i)) : undefined,
      mode: p > 0 ? MODES[Math.floor(rnd() * MODES.length)] : undefined,
      txnId: p > 0 ? `TXN${(seedNum * 1000 + i * 17).toString().padStart(8, "0")}` : undefined,
      verification: p > 0 ? (rnd() > 0.15 ? "Verified" : "Unverified") : undefined,
    });
  }

  const nextDue = installments.find((i) => i.status !== "Paid")?.due ?? "—";

  const activity: Ledger["activity"] = [];
  installments.forEach((i) => {
    if (i.paidOn) {
      activity.push({ date: i.paidOn, text: `Payment of ${formatINR(i.paid)} recorded for Instalment ${i.no}`, type: "payment" });
      if (i.verification === "Verified") {
        activity.push({ date: i.paidOn, text: `Payment ${i.receiptNo} verified by Finance`, type: "verify" });
      }
    }
  });
  activity.push({ date: "01 Jan 2026", text: "Fee structure assigned to student", type: "system" });

  return {
    totalFee: total,
    discount,
    scholarship,
    netFee,
    paid,
    outstanding,
    collectionPct,
    nextDue,
    installments,
    activity: activity.reverse(),
  };
}

const ROWS: SummaryRow[] = ALL_STUDENTS.map((st, idx) => {
  const ledger = buildLedger(st.totalFee, st.paid, idx + 1);
  let status: FeeStatus = "Partially Paid";
  if (ledger.outstanding === 0) status = "Fully Paid";
  else if (ledger.installments.some((i) => i.status === "Overdue")) status = "Overdue";
  else if (ledger.outstanding > 0 && ledger.collectionPct >= 50) status = "Due Soon";
  return {
    id: st.id,
    name: st.name,
    university: st.university,
    course: st.course,
    intake: st.batch,
    totalFee: ledger.totalFee,
    paid: ledger.paid,
    outstanding: ledger.outstanding,
    nextDue: ledger.nextDue,
    status,
    ledger,
  };
});

const STATUS_STYLES: Record<FeeStatus, string> = {
  "Fully Paid": "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  "Partially Paid": "bg-sky-100 text-sky-700 ring-1 ring-sky-200",
  "Due Soon": "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  Overdue: "bg-red-100 text-red-700 ring-1 ring-red-200",
};

// ---------- Component ----------
function FeeSummary() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uniFilter, setUniFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [intakeFilter, setIntakeFilter] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [activeStudent, setActiveStudent] = useState<SummaryRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ROWS.filter((r) => {
      if (q && !`${r.name} ${r.id}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (uniFilter !== "all" && r.university !== uniFilter) return false;
      if (courseFilter !== "all" && r.course !== courseFilter) return false;
      if (intakeFilter !== "all" && r.intake !== intakeFilter) return false;
      return true;
    });
  }, [query, statusFilter, uniFilter, courseFilter, intakeFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.total += r.totalFee;
        acc.paid += r.paid;
        acc.out += r.outstanding;
        return acc;
      },
      { total: 0, paid: 0, out: 0 },
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
        <KpiCard label="Outstanding" value={formatINR(totals.out)} icon={AlertTriangle} />
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
          <CardTitle className="text-base">Fee Ledger</CardTitle>
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
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm">{r.university}</TableCell>
                  <TableCell className="text-sm">{r.course}</TableCell>
                  <TableCell className="text-sm">{r.intake}</TableCell>
                  <TableCell className="text-right">{formatINR(r.totalFee)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{formatINR(r.paid)}</TableCell>
                  <TableCell className="text-right text-red-600">{formatINR(r.outstanding)}</TableCell>
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
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-10">
                    No matching students.
                  </TableCell>
                </TableRow>
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
  const { ledger } = row;
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
          <MiniStat label="Total Fee" value={formatINR(ledger.totalFee)} />
          <MiniStat label="Discount" value={formatINR(ledger.discount)} />
          <MiniStat label="Scholarship" value={formatINR(ledger.scholarship)} />
          <MiniStat label="Net Fee" value={formatINR(ledger.netFee)} />
          <MiniStat label="Paid Amount" value={formatINR(ledger.paid)} tone="success" />
          <MiniStat label="Outstanding" value={formatINR(ledger.outstanding)} tone="danger" />
          <MiniStat label="Collection %" value={`${ledger.collectionPct}%`} tone="primary" />
          <MiniStat label="Next Due Date" value={ledger.nextDue} />
        </div>
      </TabsContent>

      {/* Fee Structure */}
      <TabsContent value="structure" className="mt-4">
        <Card>
          <CardContent className="p-4 text-sm">
            <dl className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
              <DefItem label="Tuition Fee" value={formatINR(Math.round(ledger.totalFee * 0.85))} />
              <DefItem label="Registration" value={formatINR(Math.round(ledger.totalFee * 0.05))} />
              <DefItem label="Exam Fee" value={formatINR(Math.round(ledger.totalFee * 0.07))} />
              <DefItem label="Misc / Library" value={formatINR(Math.round(ledger.totalFee * 0.03))} />
              <DefItem label="Discount" value={`- ${formatINR(ledger.discount)}`} />
              <DefItem label="Scholarship" value={`- ${formatINR(ledger.scholarship)}`} />
              <DefItem label="Net Payable" value={formatINR(ledger.netFee)} highlight />
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
                {ledger.installments.map((i) => (
                  <TableRow key={i.no}>
                    <TableCell className="font-medium">{i.no}</TableCell>
                    <TableCell>{i.due}</TableCell>
                    <TableCell className="text-right">{formatINR(i.amount)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatINR(i.paid)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatINR(i.amount - i.paid)}</TableCell>
                    <TableCell><InstStatus s={i.status} /></TableCell>
                    <TableCell className="font-mono text-xs">{i.receiptNo ?? "—"}</TableCell>
                    <TableCell className="text-xs">{i.paidOn ?? "—"}</TableCell>
                    <TableCell className="text-xs">{i.mode ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{i.txnId ?? "—"}</TableCell>
                    <TableCell>{i.verification ? <VerifBadge v={i.verification} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">
                      {i.paid > 0 && (
                        <Button size="sm" variant="outline" onClick={() => toast.success(`Opened receipt ${i.receiptNo}`)}>
                          <Receipt className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Activity */}
      <TabsContent value="activity" className="mt-4">
        <Card>
          <CardContent className="p-4">
            <ol className="relative space-y-4 border-l pl-5">
              {ledger.activity.map((a, idx) => (
                <li key={idx} className="relative">
                  <span className="absolute -left-[26px] top-1 grid h-4 w-4 place-items-center rounded-full bg-primary/15 text-primary">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <div className="text-sm">{a.text}</div>
                  <div className="text-xs text-muted-foreground">{a.date}</div>
                </li>
              ))}
            </ol>
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

function InstStatus({ s }: { s: Installment["status"] }) {
  const map: Record<Installment["status"], { cls: string; icon: any }> = {
    Paid: { cls: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200", icon: CheckCircle2 },
    Partial: { cls: "bg-sky-100 text-sky-700 ring-1 ring-sky-200", icon: Activity },
    Pending: { cls: "bg-amber-100 text-amber-700 ring-1 ring-amber-200", icon: Clock },
    Overdue: { cls: "bg-red-100 text-red-700 ring-1 ring-red-200", icon: AlertTriangle },
  };
  const Icon = map[s].icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${map[s].cls}`}>
      <Icon className="h-3 w-3" /> {s}
    </span>
  );
}

function VerifBadge({ v }: { v: VerifyStatus }) {
  const map: Record<VerifyStatus, string> = {
    Verified: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
    Unverified: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
    Rejected: "bg-red-100 text-red-700 ring-1 ring-red-200",
  };
  return <Badge className={`${map[v]} border-0`}>{v}</Badge>;
}

// keep import used
const _used = [Percent, FileText];
void _used;
