import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  Plus,
  Search,
  Pencil,
  Eye,
  CalendarRange,
  CalendarCheck2,
  CalendarX2,
  CalendarClock,
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
  DialogFooter,
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
import { toast } from "sonner";

export const Route = createFileRoute("/universities/intakes")({
  head: () => ({ meta: [{ title: "Intakes — upCarrera" }] }),
  component: IntakesPage,
});

type IntakeStatus = "Open" | "Closed" | "Inactive";

type Intake = {
  code: string;
  name: string;
  month: string;
  year: number;
  startDate: string; // ISO
  closingDate: string; // ISO
  mappedUniversities: number;
  mappedCourses: number;
  status: IntakeStatus;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_CODE: Record<string, string> = {
  January: "JAN",
  February: "FEB",
  March: "MAR",
  April: "APR",
  May: "MAY",
  June: "JUN",
  July: "JUL",
  August: "AUG",
  September: "SEP",
  October: "OCT",
  November: "NOV",
  December: "DEC",
};

const YEARS = [2024, 2025, 2026, 2027];

const INITIAL_INTAKES: Intake[] = [
  {
    code: "INT-2026-JAN",
    name: "January 2026 Intake",
    month: "January",
    year: 2026,
    startDate: "2025-11-01",
    closingDate: "2026-01-15",
    mappedUniversities: 10,
    mappedCourses: 28,
    status: "Open",
  },
  {
    code: "INT-2026-APR",
    name: "April 2026 Intake",
    month: "April",
    year: 2026,
    startDate: "2026-02-01",
    closingDate: "2026-04-10",
    mappedUniversities: 7,
    mappedCourses: 18,
    status: "Open",
  },
  {
    code: "INT-2026-JUL",
    name: "July 2026 Intake",
    month: "July",
    year: 2026,
    startDate: "2026-05-01",
    closingDate: "2026-07-15",
    mappedUniversities: 8,
    mappedCourses: 22,
    status: "Open",
  },
  {
    code: "INT-2026-OCT",
    name: "October 2026 Intake",
    month: "October",
    year: 2026,
    startDate: "2026-08-01",
    closingDate: "2026-10-10",
    mappedUniversities: 5,
    mappedCourses: 14,
    status: "Open",
  },
  {
    code: "INT-2025-JUL",
    name: "July 2025 Intake",
    month: "July",
    year: 2025,
    startDate: "2025-05-01",
    closingDate: "2025-07-15",
    mappedUniversities: 9,
    mappedCourses: 24,
    status: "Closed",
  },
  {
    code: "INT-2025-JAN",
    name: "January 2025 Intake",
    month: "January",
    year: 2025,
    startDate: "2024-11-01",
    closingDate: "2025-01-15",
    mappedUniversities: 8,
    mappedCourses: 20,
    status: "Closed",
  },
  {
    code: "INT-2024-OCT",
    name: "October 2024 Intake",
    month: "October",
    year: 2024,
    startDate: "2024-08-01",
    closingDate: "2024-10-10",
    mappedUniversities: 3,
    mappedCourses: 9,
    status: "Inactive",
  },
];

const UNIVERSITY_OPTIONS = [
  "Manipal Sikkim University",
  "Amity University Online",
  "NMIMS Global Access",
  "Symbiosis Centre",
  "Jain Online",
  "LPU Online",
];

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: IntakeStatus }) {
  const map: Record<IntakeStatus, { cls: string; dot: string; label: string }> = {
    Open: {
      cls: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
      dot: "bg-emerald-500",
      label: "Open",
    },
    Closed: {
      cls: "bg-amber-100 text-amber-700 hover:bg-amber-100",
      dot: "bg-amber-500",
      label: "Closed",
    },
    Inactive: {
      cls: "bg-zinc-100 text-zinc-600 hover:bg-zinc-100",
      dot: "bg-zinc-400",
      label: "Inactive",
    },
  };
  const s = map[status];
  return (
    <Badge className={s.cls}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </Badge>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  icon: typeof CalendarRange;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function IntakesPage() {
  const [intakes, setIntakes] = useState<Intake[]>(INITIAL_INTAKES);

  const [createOpen, setCreateOpen] = useState(false);

  // Filters
  const [query, setQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterUniversity, setFilterUniversity] = useState<string>("all");

  const currentYear = new Date().getFullYear();

  const kpis = useMemo(
    () => ({
      total: intakes.length,
      current: intakes.filter((i) => i.year === currentYear).length,
      open: intakes.filter((i) => i.status === "Open").length,
      closed: intakes.filter((i) => i.status === "Closed").length,
    }),
    [intakes, currentYear],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return intakes.filter((i) => {
      if (q && !(i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)))
        return false;
      if (filterMonth !== "all" && i.month !== filterMonth) return false;
      if (filterYear !== "all" && String(i.year) !== filterYear) return false;
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      // mapped university filter is illustrative only (no per-intake list in mock)
      return true;
    });
  }, [intakes, query, filterMonth, filterYear, filterStatus]);

  const handleExport = () => toast.success("Export started");
  const handleResetFilters = () => {
    setQuery("");
    setFilterMonth("all");
    setFilterYear("all");
    setFilterStatus("all");
    setFilterUniversity("all");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Intakes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage reusable admission intakes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Add Intake
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Intakes"
          value={kpis.total}
          icon={CalendarRange}
          tone="bg-violet-50 text-violet-600"
        />
        <KpiCard
          title={`${currentYear} Intakes`}
          value={kpis.current}
          icon={CalendarClock}
          tone="bg-sky-50 text-sky-600"
        />
        <KpiCard
          title="Open Intakes"
          value={kpis.open}
          icon={CalendarCheck2}
          tone="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="Closed Intakes"
          value={kpis.closed}
          icon={CalendarX2}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Filters + Table */}
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search intake"
                className="pl-9"
              />
            </div>

            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterUniversity} onValueChange={setFilterUniversity}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Mapped University" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Universities</SelectItem>
                {UNIVERSITY_OPTIONS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={handleResetFilters}>
                Reset
              </Button>
              <Button variant="outline" onClick={() => toast.success("View saved")}>
                Save View
              </Button>
              <Button onClick={() => toast.success("Filters applied")}>Apply Filters</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="px-4">Intake Code</TableHead>
                <TableHead>Intake Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Closing Date</TableHead>
                <TableHead>Mapped Universities</TableHead>
                <TableHead>Mapped Courses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No intakes found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((i) => (
                  <TableRow key={i.code} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3">
                      <button className="font-mono text-xs font-medium text-primary hover:underline">
                        {i.code}
                      </button>
                    </TableCell>
                    <TableCell className="py-3 text-sm font-medium text-foreground">
                      {i.name}
                    </TableCell>
                    <TableCell className="py-3 text-sm">{formatDate(i.startDate)}</TableCell>
                    <TableCell className="py-3 text-sm">{formatDate(i.closingDate)}</TableCell>
                    <TableCell className="py-3">
                      <button className="text-sm font-medium text-primary hover:underline">
                        {i.mappedUniversities} Universities
                      </button>
                    </TableCell>
                    <TableCell className="py-3">
                      <button className="text-sm font-medium text-primary hover:underline">
                        {i.mappedCourses} Courses
                      </button>
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusBadge status={i.status} />
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <CreateIntakeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        existingCodes={intakes.map((i) => i.code)}
        onCreate={(i) => setIntakes((prev) => [i, ...prev])}
      />
    </div>
  );
}

function CreateIntakeDialog({
  open,
  onClose,
  existingCodes,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  existingCodes: string[];
  onCreate: (i: Intake) => void;
}) {
  const [month, setMonth] = useState<string>("July");
  const [year, setYear] = useState<string>(String(new Date().getFullYear() + 1));
  const [startDate, setStartDate] = useState("");
  const [closingDate, setClosingDate] = useState("");

  const name = `${month} ${year} Intake`;
  const code = `INT-${year}-${MONTH_CODE[month] ?? "XXX"}`;
  const codeTaken = existingCodes.includes(code);

  const reset = () => {
    setMonth("July");
    setYear(String(new Date().getFullYear() + 1));
    setStartDate("");
    setClosingDate("");
  };

  const handleSubmit = () => {
    if (!startDate || !closingDate) {
      toast.error("Please fill start and closing dates");
      return;
    }
    if (codeTaken) {
      toast.error(`${code} already exists`);
      return;
    }
    onCreate({
      code,
      name,
      month,
      year: Number(year),
      startDate,
      closingDate,
      mappedUniversities: 0,
      mappedCourses: 0,
      status: "Open",
    });
    toast.success(`${name} created`);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add Intake</DialogTitle>
          <DialogDescription>
            Create a reusable admission intake. Name and code are auto-generated.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Intake Name</Label>
            <Input value={name} readOnly className="bg-muted/40" />
          </div>

          <div className="space-y-2">
            <Label>Intake Code</Label>
            <Input value={code} readOnly className="bg-muted/40 font-mono text-xs" />
            {codeTaken && (
              <p className="text-xs text-destructive">This code already exists.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Admission Closing Date</Label>
            <Input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            Create Intake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
