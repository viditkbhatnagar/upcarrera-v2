import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Users,
  Clock,
  FileCheck2,
  CheckCircle2,
  Download,
  Search,
  Eye,
  CheckCheck,
  CalendarDays,
  GraduationCap,
  Building2,
  BookOpen,
  CreditCard,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UNIVERSITIES, COURSES } from "@/lib/students-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/enrollment/re-registration")({
  head: () => ({ meta: [{ title: "Re-registration — upCarrera" }] }),
  component: ReRegistrationPage,
});

type ProgressionStatus =
  | "Not Due"
  | "Due Soon"
  | "Progression Pending"
  | "Fee Pending"
  | "Submitted to University"
  | "Confirmed"
  | "On Hold";

type FeeStatus = "Paid" | "Partial" | "Pending" | "Overdue";

interface ProgressionEvent {
  date: string;
  title: string;
  description: string;
  by?: string;
}

interface ReRegRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  university: string;
  course: string;
  current: string;
  next: string;
  status: ProgressionStatus;
  fee: FeeStatus;
  feeAmount: number;
  feePaid: number;
  dueDate: string;
  coordinator: string;
  history: ProgressionEvent[];
}

const STATUSES: ProgressionStatus[] = [
  "Not Due",
  "Due Soon",
  "Progression Pending",
  "Fee Pending",
  "Submitted to University",
  "Confirmed",
  "On Hold",
];

const STATUS_STYLES: Record<ProgressionStatus, string> = {
  "Not Due": "bg-slate-100 text-slate-700 ring-slate-200",
  "Due Soon": "bg-amber-100 text-amber-800 ring-amber-200",
  "Progression Pending": "bg-orange-100 text-orange-700 ring-orange-200",
  "Fee Pending": "bg-rose-100 text-rose-700 ring-rose-200",
  "Submitted to University": "bg-sky-100 text-sky-700 ring-sky-200",
  Confirmed: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "On Hold": "bg-zinc-200 text-zinc-700 ring-zinc-300",
};

const FEE_STYLES: Record<FeeStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Partial: "bg-amber-100 text-amber-800 ring-amber-200",
  Pending: "bg-orange-100 text-orange-700 ring-orange-200",
  Overdue: "bg-rose-100 text-rose-700 ring-rose-200",
};

const SEMESTERS = [
  "Sem 1",
  "Sem 2",
  "Sem 3",
  "Sem 4",
  "Sem 5",
  "Sem 6",
  "Year 1",
  "Year 2",
  "Year 3",
];

const FIRST = ["Aarav", "Vivaan", "Aditya", "Ananya", "Diya", "Saanvi", "Kabir", "Arjun", "Reyansh", "Tara", "Zara", "Nikhil", "Pooja", "Riya", "Myra"];
const LAST = ["Sharma", "Verma", "Patel", "Reddy", "Iyer", "Nair", "Kapoor", "Singh", "Gupta", "Mehta"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function seed(n: number): ReRegRow[] {
  let r = 137;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const rows: ReRegRow[] = [];
  for (let i = 0; i < n; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const status = STATUSES[Math.floor(rand() * STATUSES.length)];
    const curIdx = Math.floor(rand() * 5) + 1;
    const current = `Sem ${curIdx}`;
    const next = `Sem ${curIdx + 1}`;
    const fee: FeeStatus = (["Paid", "Partial", "Pending", "Overdue"] as FeeStatus[])[
      Math.floor(rand() * 4)
    ];
    const feeAmount = Math.floor(rand() * 60000) + 25000;
    const feePaid =
      fee === "Paid" ? feeAmount : fee === "Partial" ? Math.floor(feeAmount * 0.5) : 0;
    const day = Math.floor(rand() * 28) + 1;
    const m = MONTHS[Math.floor(rand() * MONTHS.length)];
    const dueDate = `${String(day).padStart(2, "0")} ${m} 2026`;
    rows.push({
      id: `STU-2026-${String(2048 + i).padStart(6, "0")}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@gmail.com`,
      phone: `+91 9${Math.floor(rand() * 900000000 + 100000000)}`,
      university: UNIVERSITIES[Math.floor(rand() * UNIVERSITIES.length)],
      course: COURSES[Math.floor(rand() * COURSES.length)],
      current,
      next,
      status,
      fee,
      feeAmount,
      feePaid,
      dueDate,
      coordinator: ["Priya Sharma", "Rahul Verma", "Aisha Khan", "Karan Mehta"][
        Math.floor(rand() * 4)
      ],
      history: [
        {
          date: "12 Jan 2026",
          title: "Enrolled",
          description: `Initial enrolment confirmed for ${current}.`,
          by: "System",
        },
        {
          date: "08 May 2026",
          title: `${current} Completed`,
          description: "Semester results published. Eligible for progression.",
          by: "University",
        },
        {
          date: "02 Jun 2026",
          title: "Re-registration Initiated",
          description: `Progression window opened for ${next}.`,
          by: "Ops Team",
        },
        ...(fee !== "Paid"
          ? [
              {
                date: "05 Jun 2026",
                title: "Fee Reminder Sent",
                description: `Pending fee of ₹${(feeAmount - feePaid).toLocaleString("en-IN")} communicated to student.`,
                by: "Finance",
              },
            ]
          : []),
        ...(status === "Submitted to University" || status === "Confirmed"
          ? [
              {
                date: "10 Jun 2026",
                title: "Submitted to University",
                description: `Re-registration request for ${next} submitted.`,
                by: "Ops Team",
              },
            ]
          : []),
        ...(status === "Confirmed"
          ? [
              {
                date: "14 Jun 2026",
                title: "Re-registration Confirmed",
                description: `${next} progression confirmed by university.`,
                by: "University",
              },
            ]
          : []),
      ],
    });
  }
  return rows;
}

const ALL_ROWS = seed(28);
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

function ReRegistrationPage() {
  const [query, setQuery] = useState("");
  const [university, setUniversity] = useState("all");
  const [course, setCourse] = useState("all");
  const [semester, setSemester] = useState("all");
  const [status, setStatus] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ReRegRow | null>(null);
  const [rows, setRows] = useState<ReRegRow[]>(ALL_ROWS);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (query) {
        const q = query.toLowerCase();
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.id.toLowerCase().includes(q) &&
          !r.email.toLowerCase().includes(q)
        )
          return false;
      }
      if (university !== "all" && r.university !== university) return false;
      if (course !== "all" && r.course !== course) return false;
      if (semester !== "all" && r.current !== semester) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [rows, query, university, course, semester, status]);

  const counts = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter(
      (r) => r.status === "Progression Pending" || r.status === "Due Soon" || r.status === "Fee Pending",
    ).length;
    const applied = rows.filter((r) => r.status === "Submitted to University").length;
    const reReg = rows.filter((r) => r.status === "Confirmed").length;
    return { total, pending, applied, reReg };
  }, [rows]);

  const openHistory = (row: ReRegRow) => {
    setActive(row);
    setOpen(true);
  };

  const markConfirmed = (row: ReRegRow) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              status: "Confirmed",
              history: [
                ...r.history,
                {
                  date: new Date().toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }),
                  title: "Re-registration Confirmed",
                  description: `${r.next} progression marked confirmed.`,
                  by: "You",
                },
              ],
            }
          : r,
      ),
    );
    toast.success(`${row.name} marked as Confirmed`);
  };

  const reset = () => {
    setQuery("");
    setUniversity("all");
    setCourse("all");
    setSemester("all");
    setStatus("all");
  };

  const kpis = [
    {
      label: "Total Students",
      value: counts.total,
      icon: Users,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Re-registration Pending",
      value: counts.pending,
      icon: Clock,
      tone: "bg-orange-100 text-orange-700",
    },
    {
      label: "Re-registration Applied",
      value: counts.applied,
      icon: FileCheck2,
      tone: "bg-sky-100 text-sky-700",
    },
    {
      label: "Re Registered",
      value: counts.reReg,
      icon: CheckCircle2,
      tone: "bg-emerald-100 text-emerald-700",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Re-registration</h1>
            <p className="text-sm text-muted-foreground">
              Manage student re-registration activities.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="overflow-hidden">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{k.value}</p>
                </div>
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", k.tone)}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search student / ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={university} onValueChange={setUniversity}>
              <SelectTrigger><SelectValue placeholder="University" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Universities</SelectItem>
                {UNIVERSITIES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={course} onValueChange={setCourse}>
              <SelectTrigger><SelectValue placeholder="Course" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {COURSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={semester} onValueChange={setSemester}>
              <SelectTrigger><SelectValue placeholder="Current Sem/Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Semesters</SelectItem>
                {SEMESTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Progression Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-16">Sl No</th>
                  <th className="px-4 py-3 text-left font-medium">Student ID</th>
                  <th className="px-4 py-3 text-left font-medium">Student Name</th>
                  <th className="px-4 py-3 text-left font-medium">University</th>
                  <th className="px-4 py-3 text-left font-medium">Course</th>
                  <th className="px-4 py-3 text-left font-medium">Current</th>
                  <th className="px-4 py-3 text-left font-medium">Next</th>
                  <th className="px-4 py-3 text-left font-medium">Progression</th>
                  <th className="px-4 py-3 text-left font-medium">Fee</th>
                  <th className="px-4 py-3 text-left font-medium">Due Date</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                      No students match the current filters.
                    </td>
                  </tr>
                )}
                {filtered.map((r, i) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.university}</td>
                    <td className="px-4 py-3">{r.course}</td>
                    <td className="px-4 py-3">{r.current}</td>
                    <td className="px-4 py-3 font-medium">{r.next}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                        STATUS_STYLES[r.status],
                      )}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                        FEE_STYLES[r.fee],
                      )}>
                        {r.fee}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.dueDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openHistory(r)}>
                          <Eye className="h-4 w-4" />
                          View Progression
                        </Button>
                        {r.status !== "Confirmed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-700 hover:text-emerald-800"
                            onClick={() => markConfirmed(r)}
                          >
                            <CheckCheck className="h-4 w-4" />
                            Mark Confirmed
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>{filtered.length} of {rows.length} students</span>
          </div>
        </CardContent>
      </Card>

      {/* Drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          {active && (
            <>
              <SheetHeader className="space-y-1">
                <SheetTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Progression History
                </SheetTitle>
                <SheetDescription>
                  Re-registration timeline and current progression status.
                </SheetDescription>
              </SheetHeader>

              {/* Student basics */}
              <div className="mt-5 rounded-xl border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">{active.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{active.id}</div>
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                    STATUS_STYLES[active.status],
                  )}>
                    {active.status}
                  </span>
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info icon={Building2} label="University" value={active.university} />
                  <Info icon={BookOpen} label="Course" value={active.course} />
                  <Info icon={GraduationCap} label="Current" value={active.current} />
                  <Info icon={GraduationCap} label="Next" value={active.next} />
                  <Info icon={CalendarDays} label="Due Date" value={active.dueDate} />
                  <Info
                    icon={CreditCard}
                    label="Fee"
                    value={`${active.fee} · ${inr(active.feePaid)} / ${inr(active.feeAmount)}`}
                  />
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Coordinator: <span className="text-foreground">{active.coordinator}</span> ·{" "}
                  {active.email} · {active.phone}
                </div>
              </div>

              {/* Timeline */}
              <div className="mt-6">
                <div className="mb-3 text-sm font-semibold">Timeline</div>
                <ScrollArea className="max-h-[50vh] pr-3">
                  <ol className="relative space-y-5 border-l border-border pl-5">
                    {active.history
                      .slice()
                      .reverse()
                      .map((e, i) => (
                        <li key={i} className="relative">
                          <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-4 ring-background" />
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">{e.title}</div>
                            <div className="text-xs text-muted-foreground">{e.date}</div>
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{e.description}</p>
                          {e.by && (
                            <Badge variant="secondary" className="mt-1 text-[10px]">
                              by {e.by}
                            </Badge>
                          )}
                        </li>
                      ))}
                  </ol>
                </ScrollArea>
              </div>

              {active.status !== "Confirmed" && (
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
                  <Button
                    onClick={() => {
                      markConfirmed(active);
                      setOpen(false);
                    }}
                  >
                    <CheckCheck className="h-4 w-4" />
                    Mark Confirmed
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
