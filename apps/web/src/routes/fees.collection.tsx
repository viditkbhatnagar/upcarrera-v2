import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import {
  Wallet,
  Download,
  Send,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Percent,
  Search,
  Filter,
  Phone,
  Mail,
  MessageSquare,
  Eye,
  FileText,
  IndianRupee,
  CreditCard,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const searchSchema = z.object({
  tab: fallback(z.enum(["overdue", "due", "upcoming", "paid", "all"]), "overdue").default("overdue"),
  due: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/fees/collection")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Fee Collection — upCarrera" },
      { name: "description", content: "Manage fee collections, follow-ups and installment recoveries." },
    ],
  }),
  component: FeeCollection,
});

// ---------------- Types & Mock Data ----------------
type Verification = "Verified" | "Pending" | "Rejected";
type Channel = "WhatsApp" | "Email" | "Call";

interface Installment {
  id: string;
  studentId: string;
  student: string;
  university: string;
  course: string;
  intake: string;
  installmentName: string;
  dueDate: string; // ISO
  amount: number;
  paidDate?: string;
  paidMode?: string;
  txnId?: string;
  receipt?: string;
  verification?: Verification;
  executive: string;
  lastFollowup?: string;
  followupStatus?: "Promised" | "No Response" | "Disputed" | "Committed";
}

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return iso(d);
};

const EXECS = ["Priya Sharma", "Rahul Verma", "Aisha Khan", "Karan Mehta", "Neha Iyer"];
const UNIS = ["Amity University Online", "Manipal University", "Jain University", "LPU Online", "NMIMS Global"];
const COURSES = ["MBA", "BBA", "MCA", "BCA", "M.Com", "MA Psychology"];
const INTAKES = ["Jan 2026", "Apr 2026", "Jul 2026", "Oct 2026"];
const INSTALLMENTS = ["1st Installment", "2nd Installment", "3rd Installment", "4th Installment", "Final Installment"];
const NAMES = [
  "Ananya Sharma", "Aarav Singh", "Diya Patel", "Ishaan Reddy", "Sai Iyer",
  "Myra Nair", "Kabir Kapoor", "Reyansh Gupta", "Tara Mehta", "Zara Khan",
  "Nikhil Joshi", "Pooja Das", "Krishna Bose", "Saanvi Mishra", "Dhruv Verma",
  "Riya Sharma", "Arjun Patel", "Aanya Iyer", "Vivaan Nair", "Aditya Kapoor",
];

function seed(): Installment[] {
  const rows: Installment[] = [];
  let r = 71;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 48; i++) {
    const offset = Math.floor(rand() * 120) - 60; // -60..+60 days
    const paid = offset < -10 ? rand() < 0.6 : offset < 0 ? rand() < 0.3 : false;
    const amount = Math.floor(rand() * 80000) + 15000;
    rows.push({
      id: `INS-${String(2001 + i)}`,
      studentId: `STU-2026-${String(1024 + i).padStart(6, "0")}`,
      student: NAMES[Math.floor(rand() * NAMES.length)],
      university: UNIS[Math.floor(rand() * UNIS.length)],
      course: COURSES[Math.floor(rand() * COURSES.length)],
      intake: INTAKES[Math.floor(rand() * INTAKES.length)],
      installmentName: INSTALLMENTS[Math.floor(rand() * INSTALLMENTS.length)],
      dueDate: addDays(offset),
      amount,
      executive: EXECS[Math.floor(rand() * EXECS.length)],
      lastFollowup: rand() > 0.4 ? addDays(offset - Math.floor(rand() * 5) - 1) : undefined,
      followupStatus: rand() > 0.5 ? (["Promised", "No Response", "Disputed", "Committed"] as const)[Math.floor(rand() * 4)] : undefined,
      ...(paid
        ? {
            paidDate: addDays(offset + Math.floor(rand() * 5)),
            paidMode: (["UPI", "NEFT", "Card", "Cash", "Cheque"] as const)[Math.floor(rand() * 5)],
            txnId: `TXN${Math.floor(rand() * 9_000_000 + 1_000_000)}`,
            receipt: `RCP-${String(5001 + i)}`,
            verification: (["Verified", "Pending", "Rejected"] as const)[Math.floor(rand() * 3)],
          }
        : {}),
    });
  }
  return rows;
}

const ALL = seed();

const fmtINR = (n: number) => "₹" + n.toLocaleString("en-IN");
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const TODAY = startOfDay(today);
const endOfWeek = (() => { const d = new Date(TODAY); d.setDate(d.getDate() + (7 - d.getDay())); return d; })();
const endOfMonth = (() => { const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0); return d; })();
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

function bucketOf(i: Installment): "overdue" | "due" | "upcoming" | "paid" {
  if (i.paidDate) return "paid";
  const d = startOfDay(new Date(i.dueDate));
  if (d < TODAY) return "overdue";
  if (d <= endOfMonth) return "due";
  return "upcoming";
}

// ---------------- Components ----------------
function KpiCard({
  label, value, icon: Icon, tint = "primary", onClick, accent,
}: {
  label: string; value: string; icon: typeof Wallet;
  tint?: "primary" | "accent" | "destructive" | "success" | "warning";
  onClick?: () => void; accent?: string;
}) {
  const tintCls = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  }[tint];
  return (
    <button
      onClick={onClick}
      className="group rounded-2xl border border-border bg-surface p-5 text-left shadow-card transition hover:shadow-card-hover hover:-translate-y-0.5"
    >
      <div className={`grid h-11 w-11 place-items-center rounded-xl ${tintCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</div>
      {accent && <div className="mt-1 text-[11px] text-muted-foreground">{accent}</div>}
    </button>
  );
}

function VerifyBadge({ v }: { v?: Verification }) {
  if (!v) return null;
  const map: Record<Verification, string> = {
    Verified: "bg-success/10 text-success ring-success/20",
    Pending: "bg-warning/10 text-warning ring-warning/20",
    Rejected: "bg-destructive/10 text-destructive ring-destructive/20",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${map[v]}`}>{v}</span>;
}

// ---------------- Page ----------------
function FeeCollection() {
  const navigate = useNavigate({ from: "/fees/collection" });
  const search = Route.useSearch();
  const tab = search.tab;
  const dueFilter = search.due;

  type S = { tab: typeof tab; due: string };
  const setTab = (t: typeof tab) => navigate({ search: (p: S) => ({ ...p, tab: t }) });

  // filters
  const [q, setQ] = useState("");
  const [fUni, setFUni] = useState<string>("all");
  const [fCourse, setFCourse] = useState<string>("all");
  const [fIntake, setFIntake] = useState<string>("all");
  const [fExec, setFExec] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // modals
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<Installment | null>(null);
  const [remindOpen, setRemindOpen] = useState<Installment | null>(null);
  const [followOpen, setFollowOpen] = useState<Installment | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<Installment | null>(null);

  // KPI counts
  const stats = useMemo(() => {
    let overdue = 0, dueToday = 0, dueWeek = 0, upcoming = 0, paidMonth = 0, paidAmt = 0, targetAmt = 0;
    for (const r of ALL) {
      const b = bucketOf(r);
      const d = startOfDay(new Date(r.dueDate));
      if (b === "overdue") overdue++;
      if (!r.paidDate && d.getTime() === TODAY.getTime()) dueToday++;
      if (!r.paidDate && d >= TODAY && d <= endOfWeek) dueWeek++;
      if (b === "upcoming") upcoming++;
      if (r.paidDate) {
        const pd = new Date(r.paidDate);
        if (pd.getMonth() === TODAY.getMonth() && pd.getFullYear() === TODAY.getFullYear()) {
          paidMonth++;
          paidAmt += r.amount;
        }
      }
      targetAmt += r.amount;
    }
    const achievement = targetAmt ? Math.round((paidAmt / targetAmt) * 100) : 0;
    return { overdue, dueToday, dueWeek, upcoming, paidMonth, achievement };
  }, []);

  // filtered rows for current tab
  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return ALL.filter((r) => {
      const b = bucketOf(r);
      if (tab !== "all" && b !== tab) return false;
      if (dueFilter === "today" && (r.paidDate || startOfDay(new Date(r.dueDate)).getTime() !== TODAY.getTime())) return false;
      if (dueFilter === "week" && (r.paidDate || !(startOfDay(new Date(r.dueDate)) >= TODAY && startOfDay(new Date(r.dueDate)) <= endOfWeek))) return false;
      if (dueFilter === "month" && (r.paidDate || startOfDay(new Date(r.dueDate)) > endOfMonth)) return false;
      if (dueFilter === "overdue" && b !== "overdue") return false;
      if (ql && ![r.student, r.studentId, r.university, r.course].some((x) => x.toLowerCase().includes(ql))) return false;
      if (fUni !== "all" && r.university !== fUni) return false;
      if (fCourse !== "all" && r.course !== fCourse) return false;
      if (fIntake !== "all" && r.intake !== fIntake) return false;
      if (fExec !== "all" && r.executive !== fExec) return false;
      return true;
    });
  }, [tab, dueFilter, q, fUni, fCourse, fIntake, fExec]);

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  };

  const clearDueFilter = () => navigate({ search: (p: S) => ({ ...p, due: "" }) });

  const TABS: { key: typeof tab; label: string; count: number; tint: string }[] = [
    { key: "overdue", label: "Overdue", count: ALL.filter((r) => bucketOf(r) === "overdue").length, tint: "text-destructive" },
    { key: "due", label: "Due", count: ALL.filter((r) => bucketOf(r) === "due").length, tint: "text-warning" },
    { key: "upcoming", label: "Upcoming", count: ALL.filter((r) => bucketOf(r) === "upcoming").length, tint: "text-primary" },
    { key: "paid", label: "Paid", count: ALL.filter((r) => bucketOf(r) === "paid").length, tint: "text-success" },
    { key: "all", label: "All", count: ALL.length, tint: "text-foreground" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fee Management</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Fee Collection</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage fee collections and follow-ups.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setExportOpen(true)} className="rounded-xl">
            <Download className="h-4 w-4" />
            Export Collection
          </Button>
          <Button
            onClick={() => {
              if (selected.size === 0) {
                toast.message("Select installments first to send bulk reminders.");
                return;
              }
              setBulkOpen(true);
            }}
            className="rounded-xl bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <Send className="h-4 w-4" />
            Send Bulk Reminder
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Overdue Installments" value={String(stats.overdue)} icon={AlertTriangle} tint="destructive" onClick={() => { clearDueFilter(); setTab("overdue"); }} />
        <KpiCard label="Due Today" value={String(stats.dueToday)} icon={CalendarDays} tint="warning" onClick={() => navigate({ search: () => ({ tab: "due", due: "today" }) })} />
        <KpiCard label="Due This Week" value={String(stats.dueWeek)} icon={CalendarRange} tint="warning" onClick={() => navigate({ search: () => ({ tab: "due", due: "week" }) })} />
        <KpiCard label="Upcoming" value={String(stats.upcoming)} icon={CalendarClock} tint="primary" onClick={() => { clearDueFilter(); setTab("upcoming"); }} />
        <KpiCard label="Paid This Month" value={String(stats.paidMonth)} icon={CheckCircle2} tint="success" onClick={() => { clearDueFilter(); setTab("paid"); }} />
        <KpiCard label="Collection %" value={`${stats.achievement}%`} icon={Percent} tint="accent" accent="Achievement vs target" />
      </div>

      {/* Search + Filter bar */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search student, ID, university…"
              className="pl-9 rounded-xl"
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} className="rounded-xl">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          {dueFilter && (
            <button
              onClick={clearDueFilter}
              className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
            >
              Due filter: {dueFilter}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {showFilters && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">University</Label>
              <Select value={fUni} onValueChange={setFUni}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Universities</SelectItem>
                  {UNIS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Course</Label>
              <Select value={fCourse} onValueChange={setFCourse}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {COURSES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Intake</Label>
              <Select value={fIntake} onValueChange={setFIntake}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Intakes</SelectItem>
                  {INTAKES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Support Executive</Label>
              <Select value={fExec} onValueChange={setFExec}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Executives</SelectItem>
                  {EXECS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface p-1 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { clearDueFilter(); setTab(t.key); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-card"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span>{t.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tab === t.key ? "bg-primary-foreground/15 text-primary-foreground" : `bg-muted ${t.tint}`}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm text-muted-foreground">
          <span>{rows.length} installment{rows.length === 1 ? "" : "s"}</span>
          {selected.size > 0 && <span className="font-semibold text-foreground">{selected.size} selected</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-3"><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} /></th>
                <th className="w-12 px-3 py-3">Sl</th>
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">University</th>
                <th className="px-3 py-3">Course</th>
                <th className="px-3 py-3">Installment</th>
                <th className="px-3 py-3">{tab === "paid" ? "Paid Date" : "Due Date"}</th>
                <th className="px-3 py-3 text-right">Amount</th>
                {tab === "overdue" && <th className="px-3 py-3">Days Overdue</th>}
                {tab === "upcoming" && <th className="px-3 py-3">Days Remaining</th>}
                {tab === "overdue" && <th className="px-3 py-3">Executive</th>}
                {tab === "overdue" && <th className="px-3 py-3">Follow-up</th>}
                {tab === "paid" && <th className="px-3 py-3">Mode</th>}
                {tab === "paid" && <th className="px-3 py-3">Verification</th>}
                {tab === "all" && <th className="px-3 py-3">Status</th>}
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">No installments match the current filters.</td></tr>
              )}
              {rows.map((r, idx) => {
                const b = bucketOf(r);
                const dueD = startOfDay(new Date(r.dueDate));
                const diff = daysBetween(TODAY, dueD); // pos = overdue
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-3"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                    <td className="px-3 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-foreground">{r.student}</div>
                      <div className="text-[11px] text-muted-foreground">{r.studentId}</div>
                    </td>
                    <td className="px-3 py-3 text-foreground">{r.university}</td>
                    <td className="px-3 py-3 text-muted-foreground">{r.course}</td>
                    <td className="px-3 py-3 text-foreground">{r.installmentName}</td>
                    <td className="px-3 py-3 text-foreground">{fmtDate(r.paidDate && tab === "paid" ? r.paidDate : r.dueDate)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">{fmtINR(r.amount)}</td>
                    {tab === "overdue" && <td className="px-3 py-3"><span className="font-semibold text-destructive">{diff}d</span></td>}
                    {tab === "upcoming" && <td className="px-3 py-3 text-primary font-semibold">{-diff}d</td>}
                    {tab === "overdue" && <td className="px-3 py-3 text-foreground">{r.executive}</td>}
                    {tab === "overdue" && (
                      <td className="px-3 py-3">
                        <div className="text-xs text-muted-foreground">{r.lastFollowup ? fmtDate(r.lastFollowup) : "—"}</div>
                        {r.followupStatus && <Badge variant="secondary" className="mt-1 text-[10px]">{r.followupStatus}</Badge>}
                      </td>
                    )}
                    {tab === "paid" && <td className="px-3 py-3 text-foreground">{r.paidMode ?? "—"}</td>}
                    {tab === "paid" && <td className="px-3 py-3"><VerifyBadge v={r.verification} /></td>}
                    {tab === "all" && (
                      <td className="px-3 py-3">
                        <Badge
                          className={
                            b === "overdue" ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                            : b === "due" ? "bg-warning/10 text-warning hover:bg-warning/10"
                            : b === "upcoming" ? "bg-primary/10 text-primary hover:bg-primary/10"
                            : "bg-success/10 text-success hover:bg-success/10"
                          }
                        >{b.charAt(0).toUpperCase() + b.slice(1)}</Badge>
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {b === "paid" ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setReceiptOpen(r)} title="View Receipt"><Eye className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => { toast.success(`Receipt ${r.receipt} downloaded.`); }} title="Download Receipt"><Download className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setReceiptOpen(r)} title="View Payment"><FileText className="h-4 w-4" /></Button>
                          </>
                        ) : b === "upcoming" ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setRemindOpen(r)} title="Send Reminder"><Send className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => toast.message(`Opening fee account for ${r.student}`)} title="View Fee Account"><Eye className="h-4 w-4" /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setPayOpen(r)} title="Record Payment"><IndianRupee className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setRemindOpen(r)} title="Send Reminder"><Send className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => { toast.success(`Calling ${r.student}…`); }} title="Call"><Phone className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setFollowOpen(r)} title="Add Follow-up"><MessageSquare className="h-4 w-4" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ----------- Export Modal ----------- */}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} count={rows.length} />

      {/* ----------- Bulk Reminder Modal ----------- */}
      <BulkReminderModal open={bulkOpen} onClose={() => setBulkOpen(false)} count={selected.size} onSent={() => { setBulkOpen(false); setSelected(new Set()); toast.success(`Reminders queued for ${selected.size} students.`); }} />

      {/* ----------- Record Payment Modal ----------- */}
      <RecordPaymentModal item={payOpen} onClose={() => setPayOpen(null)} />

      {/* ----------- Reminder Modal ----------- */}
      <ReminderModal item={remindOpen} onClose={() => setRemindOpen(null)} />

      {/* ----------- Follow-up Drawer ----------- */}
      <FollowupDrawer item={followOpen} onClose={() => setFollowOpen(null)} />

      {/* ----------- Receipt Modal ----------- */}
      <ReceiptModal item={receiptOpen} onClose={() => setReceiptOpen(null)} />
    </div>
  );
}

// ---------------- Modals ----------------
function ExportModal({ open, onClose, count }: { open: boolean; onClose: () => void; count: number }) {
  const [format, setFormat] = useState<"Excel" | "PDF" | "CSV">("Excel");
  const [scope, setScope] = useState<"current" | "all">("current");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Export Collection</DialogTitle>
          <DialogDescription>Choose format and date range for your export.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Format</Label>
            <div className="mt-1 flex gap-2">
              {(["Excel", "PDF", "CSV"] as const).map((f) => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${format === f ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Scope</Label>
            <div className="mt-1 flex gap-2">
              <button onClick={() => setScope("current")} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${scope === "current" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>Current Tab ({count})</button>
              <button onClick={() => setScope("all")} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${scope === "all" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>All Tabs</button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onClose(); toast.success(`${format} export generated.`); }}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkReminderModal({ open, onClose, count, onSent }: { open: boolean; onClose: () => void; count: number; onSent: () => void }) {
  const [channel, setChannel] = useState<Channel>("WhatsApp");
  const [template, setTemplate] = useState("payment_due");
  const [msg, setMsg] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>Send Bulk Reminder</DialogTitle>
          <DialogDescription>{count} student{count === 1 ? "" : "s"} selected.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Communication Channel</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["WhatsApp", "Email"] as const).map((c) => (
                <button key={c} onClick={() => setChannel(c)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${channel === c ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  {c === "WhatsApp" ? <MessageSquare className="inline h-4 w-4 mr-1" /> : <Mail className="inline h-4 w-4 mr-1" />}
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payment_due">Payment Due Reminder</SelectItem>
                <SelectItem value="overdue_notice">Overdue Notice</SelectItem>
                <SelectItem value="final_notice">Final Notice</SelectItem>
                <SelectItem value="upcoming_due">Upcoming Due Soft Reminder</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Custom Message</Label>
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder="Optional custom note appended to the template…" className="rounded-xl" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => toast.message("Preview opened.")}>Preview</Button>
          <Button onClick={onSent}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentModal({ item, onClose }: { item: Installment | null; onClose: () => void }) {
  const [mode, setMode] = useState("UPI");
  const [txn, setTxn] = useState("");
  const [date, setDate] = useState(iso(today));
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>{item.student} · {item.installmentName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{fmtINR(item.amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span>{fmtDate(item.dueDate)}</span></div>
          </div>
          <div>
            <Label className="text-xs">Payment Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["UPI", "NEFT", "Card", "Cash", "Cheque"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Payment Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Transaction ID</Label>
              <Input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="TXN…" className="rounded-xl" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onClose(); toast.success(`Payment recorded for ${item.student}.`); }}><CreditCard className="h-4 w-4" /> Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderModal({ item, onClose }: { item: Installment | null; onClose: () => void }) {
  const [channel, setChannel] = useState<"WhatsApp" | "Email">("Email");
  const [msg, setMsg] = useState("");
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Send Reminder</DialogTitle>
          <DialogDescription>To {item.student} · {item.studentId}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{item.installmentName}</span><span className="font-semibold">{fmtINR(item.amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span>{fmtDate(item.dueDate)}</span></div>
          </div>
          <div>
            <Label className="text-xs">Channel</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["WhatsApp", "Email"] as const).map((c) => (
                <button key={c} onClick={() => setChannel(c)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${channel === c ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  {c === "WhatsApp" ? <MessageSquare className="inline h-4 w-4 mr-1" /> : <Mail className="inline h-4 w-4 mr-1" />}
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder={`Dear ${item.student}, this is a reminder for your pending installment of ${fmtINR(item.amount)}…`} className="rounded-xl" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => toast.message("Preview opened.")}>Preview</Button>
          <Button onClick={() => { onClose(); toast.success(`Reminder sent via ${channel}.`); }}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowupDrawer({ item, onClose }: { item: Installment | null; onClose: () => void }) {
  const [type, setType] = useState<Channel>("Call");
  const [remarks, setRemarks] = useState("");
  const [next, setNext] = useState("");
  return (
    <Drawer open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[88vh]">
        <DrawerHeader>
          <DrawerTitle>Add Follow-up</DrawerTitle>
        </DrawerHeader>
        {item && (
          <div className="space-y-4 px-4 pb-2">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="font-semibold text-foreground">{item.student}</div>
              <div className="text-xs text-muted-foreground">{item.studentId} · {item.university}</div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span>{item.installmentName}</span>
                <span className="font-semibold">{fmtINR(item.amount)}</span>
              </div>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input value={fmtDate(iso(today))} disabled className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Follow-up Type</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(["Call", "WhatsApp", "Email"] as const).map((c) => (
                  <button key={c} onClick={() => setType(c)}
                    className={`inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold ${type === c ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {c === "Call" ? <Phone className="h-4 w-4" /> : c === "WhatsApp" ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} placeholder="Conversation notes, commitments…" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Next Follow-up Date</Label>
              <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        )}
        <DrawerFooter>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { onClose(); toast.success("Follow-up saved."); }}>Save</Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ReceiptModal({ item, onClose }: { item: Installment | null; onClose: () => void }) {
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Payment Receipt</DialogTitle>
          <DialogDescription>{item.receipt}</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-border bg-muted/20 p-5 text-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Receipt</div>
              <div className="font-bold text-foreground">{item.receipt}</div>
            </div>
            <VerifyBadge v={item.verification} />
          </div>
          <dl className="divide-y divide-border text-sm">
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Student</dt><dd className="font-semibold">{item.student}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Student ID</dt><dd>{item.studentId}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">University</dt><dd>{item.university}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Installment</dt><dd>{item.installmentName}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Amount</dt><dd className="font-bold text-foreground">{fmtINR(item.amount)}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Payment Date</dt><dd>{item.paidDate ? fmtDate(item.paidDate) : "—"}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Payment Mode</dt><dd>{item.paidMode}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Transaction ID</dt><dd className="font-mono text-xs">{item.txnId}</dd></div>
          </dl>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => toast.success(`Receipt ${item.receipt} downloaded.`)}><Download className="h-4 w-4" /> Download PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
