import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Plus,
  Search,
  Pencil,
  Eye,
  Trash2,
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
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/universities/intakes")({
  head: () => ({ meta: [{ title: "Intakes — upCarrera" }] }),
  component: IntakesPage,
});

type IntakeStatus = "Open" | "Closed" | "Inactive";

type Intake = {
  id: number;
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

/** Raw intake row as returned by GET /api/intakes (snake_case, nullable). */
type ApiIntake = {
  id: number;
  name: string | null;
  month: string | null;
  year: number | null;
  start_date: string | null;
  closing_date: string | null;
  status: string | null;
  mapped_universities: number;
  mapped_courses: number;
};

const INTAKE_STATUSES: IntakeStatus[] = ["Open", "Closed", "Inactive"];

function toIntakeStatus(value: string | null): IntakeStatus {
  return INTAKE_STATUSES.includes(value as IntakeStatus)
    ? (value as IntakeStatus)
    : "Open";
}

/** Prisma serialises dates as full ISO timestamps; the date inputs need YYYY-MM-DD. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function mapApiIntake(r: ApiIntake): Intake {
  const month = r.month ?? "";
  const year = r.year ?? new Date().getFullYear();
  return {
    id: r.id,
    code: `INT-${year}-${MONTH_CODE[month] ?? "XXX"}`,
    name: r.name ?? `${month} ${year} Intake`,
    month,
    year,
    startDate: toDateInput(r.start_date),
    closingDate: toDateInput(r.closing_date),
    mappedUniversities: r.mapped_universities ?? 0,
    mappedCourses: r.mapped_courses ?? 0,
    status: toIntakeStatus(r.status),
  };
}

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
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["intakes"],
    queryFn: () =>
      apiGet<{ items: ApiIntake[]; total: number; page: number; limit: number }>(
        "/intakes",
        { page: 1, limit: 100 },
      ),
  });

  const intakes = useMemo<Intake[]>(
    () => (data?.items ?? []).map(mapApiIntake),
    [data],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Intake | null>(null);
  const [deleting, setDeleting] = useState<Intake | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/intakes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes"] });
      toast.success("Intake deleted");
      setDeleting(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

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
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Loading intakes…
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-red-500"
                  >
                    Failed to load intakes. Please try again.
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
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
                  <TableRow key={i.id} className="hover:bg-muted/40">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit"
                          onClick={() => setEditing(i)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => setDeleting(i)}
                        >
                          <Trash2 className="h-4 w-4" />
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

      <CreateIntakeDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <EditIntakeDialog intake={editing} onClose={() => setEditing(null)} />

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete intake</DialogTitle>
            <DialogDescription>
              {deleting
                ? `This will permanently remove ${deleting.name}. This action cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type IntakeWriteBody = {
  name: string;
  month: string;
  year: number;
  start_date: string;
  closing_date: string;
  status: string;
};

function CreateIntakeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>("July");
  const [year, setYear] = useState<string>(String(new Date().getFullYear() + 1));
  const [startDate, setStartDate] = useState("");
  const [closingDate, setClosingDate] = useState("");

  const name = `${month} ${year} Intake`;
  const code = `INT-${year}-${MONTH_CODE[month] ?? "XXX"}`;

  const reset = () => {
    setMonth("July");
    setYear(String(new Date().getFullYear() + 1));
    setStartDate("");
    setClosingDate("");
  };

  const createMut = useMutation({
    mutationFn: (body: IntakeWriteBody) => apiPost("/intakes", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes"] });
      toast.success("Intake created");
      reset();
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const handleSubmit = () => {
    if (!startDate || !closingDate) {
      toast.error("Please fill start and closing dates");
      return;
    }
    createMut.mutate({
      name,
      month,
      year: Number(year),
      start_date: startDate,
      closing_date: closingDate,
      status: "Open",
    });
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
            disabled={createMut.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {createMut.isPending ? "Saving…" : "Create Intake"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditIntakeDialog({
  intake,
  onClose,
}: {
  intake: Intake | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>("July");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [startDate, setStartDate] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [status, setStatus] = useState<IntakeStatus>("Open");

  // Sync the form whenever a different intake is opened for editing.
  useEffect(() => {
    if (!intake) return;
    setMonth(intake.month || "July");
    setYear(String(intake.year));
    setStartDate(intake.startDate);
    setClosingDate(intake.closingDate);
    setStatus(intake.status);
  }, [intake]);

  const name = `${month} ${year} Intake`;
  const code = `INT-${year}-${MONTH_CODE[month] ?? "XXX"}`;

  const updateMut = useMutation({
    mutationFn: (body: IntakeWriteBody) =>
      apiPatch(`/intakes/${intake?.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes"] });
      toast.success("Intake updated");
      onClose();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const handleSubmit = () => {
    if (!startDate || !closingDate) {
      toast.error("Please fill start and closing dates");
      return;
    }
    updateMut.mutate({
      name,
      month,
      year: Number(year),
      start_date: startDate,
      closing_date: closingDate,
      status,
    });
  };

  return (
    <Dialog open={intake !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Intake</DialogTitle>
          <DialogDescription>
            Update this admission intake. Name and code are auto-generated.
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

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as IntakeStatus)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {INTAKE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateMut.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {updateMut.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
