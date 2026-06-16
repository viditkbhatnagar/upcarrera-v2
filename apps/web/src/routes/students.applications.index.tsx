import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Plus,
  Download,
  Search,
  Filter,
  RefreshCcw,
  Bookmark,
  Eye,
  Pencil,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  FileText,
  ArrowRight,
  MoreHorizontal,
  Mail,
  CalendarDays,
  Building2,
  BookOpen,
  Layers,
  User as UserIcon,
  Sparkles,
  Trash2,
  CheckCircle2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/students/applications/")({
  head: () => ({ meta: [{ title: "Applications — upCarrera" }] }),
  component: ApplicationsPage,
});

/* ---------------- Types & Data ---------------- */

type AppStatus =
  | "New Lead"
  | "Registration Fee Pending"
  | "Registration Fee Paid"
  | "Form Pending"
  | "Admin Verification Pending"
  | "Enrolled"
  | "Rejected";

type FeeStatus = "Pending" | "Partially Paid" | "Paid" | "Refunded";

interface Application {
  id: string;
  date: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: boolean;
  university: string;
  course: string;
  batch: string;
  counsellor: string;
  counsellorInitials: string;
  feeStatus: FeeStatus;
  status: AppStatus;
  /** Real lifecycle label from the API (Active / Converted / Archived / Inactive). */
  statusLabel: string;
  /** Real fee amount recorded on the application row (₹), 0 when none. */
  amount: number;
  /** Real registration-fee paid date, formatted; "—" when unpaid. */
  paidDate: string;
}

const STATUS_ORDER: AppStatus[] = [
  "New Lead",
  "Registration Fee Pending",
  "Registration Fee Paid",
  "Form Pending",
  "Admin Verification Pending",
  "Enrolled",
  "Rejected",
];

const STATUS_STYLES: Record<AppStatus, string> = {
  "New Lead": "bg-sky-100 text-sky-700 ring-sky-200",
  "Registration Fee Pending": "bg-orange-100 text-orange-700 ring-orange-200",
  "Registration Fee Paid": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Form Pending": "bg-purple-100 text-purple-700 ring-purple-200",
  "Admin Verification Pending": "bg-yellow-100 text-yellow-800 ring-yellow-200",
  Enrolled: "bg-primary/10 text-primary ring-primary/20",
  Rejected: "bg-red-100 text-red-700 ring-red-200",
};

const STATUS_DOT: Record<AppStatus, string> = {
  "New Lead": "bg-sky-500",
  "Registration Fee Pending": "bg-orange-500",
  "Registration Fee Paid": "bg-emerald-500",
  "Form Pending": "bg-purple-500",
  "Admin Verification Pending": "bg-yellow-500",
  Enrolled: "bg-primary",
  Rejected: "bg-red-500",
};

const FEE_STYLES: Record<FeeStatus, string> = {
  Pending: "bg-orange-100 text-orange-700 ring-orange-200",
  "Partially Paid": "bg-amber-100 text-amber-800 ring-amber-200",
  Paid: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Refunded: "bg-slate-100 text-slate-700 ring-slate-200",
};

/* ---------------- Live API wiring (GET /api/applications) ---------------- */
// The list endpoint now decorates each row with its joined display fields:
// applicant_name/email/phone (applicant identity), course_title, university_title,
// consultant_name and a human status_label (Active / Converted / Archived /
// Inactive). The raw FK ids are still present but no longer surfaced in the UI.
// admission_status / is_converted / paid_date are mapped into the richer 7-stage
// pipeline vocabulary this UI renders; status_label is shown verbatim as the
// real lifecycle tag. All option lists are derived from the live rows — there is
// no mock data on this screen.

interface ApiApplicationRow {
  application_id: number | string;
  custom_application_id: string | null;
  // Decorated applicant identity (joined from users, falls back to the row).
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  name: string | null;
  email: string | null;
  code: string | null;
  phone: string | null;
  university_id: number | string | null;
  course_id: number | string | null;
  specialisation_id: number | string | null;
  session_id: number | string | null;
  whatsapp_no: string | null;
  admission_status: number | string | boolean | null;
  amount: number | string | null;
  paid_date: string | null;
  is_converted: number | string | boolean | null;
  pipeline_user: number | string | null;
  enrollment_date: string | null;
  created_at: string | null;
  // Decorated display fields resolved server-side (no N+1).
  course_title: string | null;
  university_title: string | null;
  consultant_id: number | string | null;
  consultant_name: string | null;
  status_label: string | null;
}

function truthy(v: number | string | boolean | null | undefined): boolean {
  return v === 1 || v === "1" || v === true || v === "true";
}

function mapApiStatus(r: ApiApplicationRow): AppStatus {
  if (truthy(r.is_converted)) return "Enrolled";
  if (truthy(r.admission_status)) return "Admin Verification Pending";
  if (r.paid_date != null && String(r.paid_date).trim() !== "") return "Registration Fee Paid";
  return "New Lead";
}

function mapApiFee(r: ApiApplicationRow): FeeStatus {
  const amount = Number(r.amount ?? 0);
  if (r.paid_date != null && String(r.paid_date).trim() !== "") return "Paid";
  if (amount > 0) return "Partially Paid";
  return "Pending";
}

function formatApiDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const v of values) {
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function mapApiApplication(r: ApiApplicationRow): Application {
  const displayId =
    r.custom_application_id != null && String(r.custom_application_id).trim() !== ""
      ? String(r.custom_application_id)
      : `APP-${r.application_id}`;
  // Prefer the decorated applicant identity; fall back to the raw row columns.
  const name = firstNonEmpty(r.applicant_name, r.name) || `Applicant #${r.application_id}`;
  const consultantName = firstNonEmpty(r.consultant_name);
  const counsellor = consultantName || "Unassigned";
  return {
    id: displayId,
    date: formatApiDate(r.created_at ?? r.enrollment_date),
    name,
    email: firstNonEmpty(r.applicant_email, r.email) || "—",
    phone:
      firstNonEmpty(r.applicant_phone) ||
      [r.code, r.phone].filter((p) => p && String(p).trim() !== "").join(" ") ||
      "—",
    whatsapp: r.whatsapp_no != null && String(r.whatsapp_no).trim() !== "",
    university: firstNonEmpty(r.university_title) || "—",
    course: firstNonEmpty(r.course_title) || "—",
    batch: r.session_id != null ? `Intake #${r.session_id}` : "—",
    counsellor,
    counsellorInitials: consultantName ? initialsFromName(consultantName) : "—",
    feeStatus: mapApiFee(r),
    status: mapApiStatus(r),
    statusLabel: firstNonEmpty(r.status_label) || "—",
    amount: Number(r.amount ?? 0) || 0,
    paidDate: formatApiDate(r.paid_date),
  };
}

/* ---------------- Page ---------------- */

function ApplicationsPage() {
  const [statusFilter, setStatusFilter] = useState<AppStatus | "All">("All");
  const [feeFilter, setFeeFilter] = useState<FeeStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [appId, setAppId] = useState("");
  const [university, setUniversity] = useState("All");
  const [course, setCourse] = useState("All");
  const [batch, setBatch] = useState("All");
  const [counsellor, setCounsellor] = useState("All");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerApp, setDrawerApp] = useState<Application | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const PAGE_SIZE = 10;

  // Live applications list. The endpoint paginates server-side (page/limit) but
  // exposes no status/text filters, so we fetch the current page and apply the
  // existing UI filters client-side over the fetched rows. Pagination is driven
  // by the API total; pipeline stage counts are best-effort over this page only.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", { page, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<{ items: ApiApplicationRow[]; total: number; page: number; limit: number }>(
        "/applications",
        { page, limit: PAGE_SIZE },
      ),
  });

  const apiTotal = data?.total ?? 0;
  const apiRows = useMemo(() => (data?.items ?? []).map(mapApiApplication), [data]);

  // Filter dropdown options derived from the live page rows (no mock arrays).
  const distinct = (values: string[]): string[] =>
    [...new Set(values.filter((v) => v && v !== "—"))].sort((a, b) => a.localeCompare(b));
  const universityOptions = useMemo(
    () => distinct(apiRows.map((a) => a.university)),
    [apiRows],
  );
  const courseOptions = useMemo(() => distinct(apiRows.map((a) => a.course)), [apiRows]);
  const counsellorOptions = useMemo(
    () => distinct(apiRows.map((a) => a.counsellor)),
    [apiRows],
  );
  const batchOptions = useMemo(() => distinct(apiRows.map((a) => a.batch)), [apiRows]);

  const filtered = useMemo(() => {
    return apiRows.filter((a) => {
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (feeFilter !== "All" && a.feeStatus !== feeFilter) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (phone && !a.phone.includes(phone)) return false;
      if (appId && !a.id.toLowerCase().includes(appId.toLowerCase())) return false;
      if (university !== "All" && a.university !== university) return false;
      if (course !== "All" && a.course !== course) return false;
      if (batch !== "All" && a.batch !== batch) return false;
      if (counsellor !== "All" && a.counsellor !== counsellor) return false;
      return true;
    });
  }, [apiRows, statusFilter, feeFilter, search, phone, appId, university, course, batch, counsellor]);

  // Server-driven pagination: the table shows the fetched (and client-filtered)
  // page; the pager spans all pages reported by the API total.
  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered;

  const counts = useMemo(() => {
    const map: Record<AppStatus, number> = {
      "New Lead": 0,
      "Registration Fee Pending": 0,
      "Registration Fee Paid": 0,
      "Form Pending": 0,
      "Admin Verification Pending": 0,
      Enrolled: 0,
      Rejected: 0,
    };
    apiRows.forEach((a) => (map[a.status] += 1));
    return map;
  }, [apiRows]);

  const toggleAll = () => {
    if (pageRows.every((r) => selected.has(r.id))) {
      const next = new Set(selected);
      pageRows.forEach((r) => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      pageRows.forEach((r) => next.add(r.id));
      setSelected(next);
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const resetFilters = () => {
    setStatusFilter("All");
    setFeeFilter("All");
    setSearch("");
    setPhone("");
    setAppId("");
    setUniversity("All");
    setCourse("All");
    setBatch("All");
    setCounsellor("All");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Student Management
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Applications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track all student applications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setLeadOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover"
          >
            <UserPlus className="h-4 w-4" />
            Add Lead
          </button>
          <Link
            to="/students/applications/new"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            New Application
          </Link>
        </div>
      </div>

      {/* Pipeline */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Application Pipeline</div>
            <div className="text-xs text-muted-foreground">Click a stage to filter the table</div>
          </div>
          {statusFilter !== "All" && (
            <button
              onClick={() => setStatusFilter("All")}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Clear stage
            </button>
          )}
        </div>
        <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin pb-1">
          {STATUS_ORDER.map((s, i) => {
            const active = statusFilter === s;
            const total = Math.max(apiRows.length, 1);
            const pct = (counts[s] / total) * 100;
            return (
              <div key={s} className="flex min-w-[160px] flex-1 items-center gap-1">
                <button
                  onClick={() => {
                    setStatusFilter(active ? "All" : s);
                    setPage(1);
                  }}
                  className={cn(
                    "group relative flex w-full flex-col gap-2 rounded-xl border bg-background p-3 text-left transition hover:border-primary/40",
                    active ? "border-primary ring-2 ring-primary/20" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Stage {i + 1}
                    </span>
                  </div>
                  <div className="text-xs font-semibold leading-tight text-foreground">{s}</div>
                  <div className="flex items-end justify-between">
                    <div className="text-xl font-bold tracking-tight text-foreground">
                      {counts[s]}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{pct.toFixed(0)}%</div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", STATUS_DOT[s])}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </button>
                {i < STATUS_ORDER.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Student name" value={search} onChange={setSearch} />
          <FilterInput icon={Phone} placeholder="Phone number" value={phone} onChange={setPhone} />
          <FilterInput icon={FileText} placeholder="Application ID" value={appId} onChange={setAppId} />
          <FilterSelect value={university} onChange={setUniversity} options={["All", ...universityOptions]} placeholder="University" />
          <FilterSelect value={course} onChange={setCourse} options={["All", ...courseOptions]} placeholder="Course" />
          <FilterSelect value={batch} onChange={setBatch} options={["All", ...batchOptions]} placeholder="Batch" />
          <FilterSelect value={counsellor} onChange={setCounsellor} options={["All", ...counsellorOptions]} placeholder="Counsellor" />
          <FilterSelect
            value={feeFilter}
            onChange={(v) => setFeeFilter(v as FeeStatus | "All")}
            options={["All", "Pending", "Partially Paid", "Paid", "Refunded"]}
            placeholder="Fee Status"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Date range: <span className="font-medium text-foreground">Last 30 days</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Bookmark className="h-3.5 w-3.5" />
              Save view
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              Apply filters
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <BulkBtn icon={UserIcon} label="Assign counsellor" />
            <BulkBtn icon={Mail} label="Email" />
            <BulkBtn icon={Download} label="Export" />
            <BulkBtn icon={Trash2} label="Delete" danger />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {apiTotal.toLocaleString()} applications
            {statusFilter !== "All" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {statusFilter}
                <button onClick={() => setStatusFilter("All")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Application Date</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState />
          ) : pageRows.length === 0 ? (
            <EmptyState onCreate={() => {}} />
          ) : (
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3">App ID</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">University</th>
                  <th className="px-3 py-3">Course</th>
                  <th className="px-3 py-3">Batch</th>
                  <th className="px-3 py-3">Counsellor</th>
                  <th className="px-3 py-3">Fee</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-border transition hover:bg-muted/40"
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={selected.has(a.id)}
                        onChange={() => toggleOne(a.id)}
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-primary">{a.id}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{a.date}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-foreground">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground">{a.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-foreground">{a.phone}</span>
                        {a.whatsapp && (
                          <span title="WhatsApp" className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                            <MessageCircle className="h-3 w-3" />
                          </span>
                        )}
                        <button title="Call" className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-sky-600 hover:bg-sky-200">
                          <Phone className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground">{a.university}</td>
                    <td className="px-3 py-3 text-xs font-medium text-foreground">{a.course}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{a.batch}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {a.counsellorInitials}
                        </span>
                        <span className="text-xs text-foreground">{a.counsellor}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", FEE_STYLES[a.feeStatus])}>
                        {a.feeStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <button
                          onClick={() => {
                            setStatusFilter(a.status);
                            setPage(1);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 transition hover:opacity-80",
                            STATUS_STYLES[a.status],
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[a.status])} />
                          {a.status}
                        </button>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {a.statusLabel}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="View" onClick={() => setDrawerApp(a)} icon={Eye} />
                        <IconBtn title="Edit" icon={Pencil} />
                        <IconBtn title="More" icon={MoreHorizontal} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pageRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}</span>–
              <span className="font-semibold text-foreground">{Math.min(currentPage * PAGE_SIZE, apiTotal)}</span> of{" "}
              <span className="font-semibold text-foreground">{apiTotal}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs font-semibold transition",
                    p === currentPage
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-foreground hover:bg-muted",
                  )}
                >
                  {p}
                </button>
              ))}
              {totalPages > 5 && <span className="px-1 text-muted-foreground">…</span>}
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerApp && <DetailsDrawer app={drawerApp} onClose={() => setDrawerApp(null)} />}
      <AddLeadDialog
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        universityOptions={universityOptions}
        courseOptions={courseOptions}
        batchOptions={batchOptions}
        counsellorOptions={counsellorOptions}
      />
    </div>
  );
}

/* ---------------- Bits ---------------- */

function FilterInput({
  icon: Icon,
  placeholder,
  value,
  onChange,
}: {
  icon: typeof Search;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-8 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "All" ? `All ${placeholder}` : o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function IconBtn({
  icon: Icon,
  title,
  onClick,
}: {
  icon: typeof Eye;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="group grid h-8 w-8 place-items-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function BulkBtn({
  icon: Icon,
  label,
  danger,
}: {
  icon: typeof Eye;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-xs font-semibold transition",
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-border text-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/5 text-primary">
        <RefreshCcw className="h-10 w-10 animate-spin" />
      </div>
      <div className="mt-5 text-base font-semibold text-foreground">Loading applications…</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">
        Fetching the latest records from the server.
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-red-50 text-red-500">
        <FileText className="h-10 w-10" />
      </div>
      <div className="mt-5 text-base font-semibold text-foreground">Could not load applications</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">
        Something went wrong while fetching applications. Please try again.
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/5 text-primary">
        <FileText className="h-10 w-10" />
      </div>
      <div className="mt-5 text-base font-semibold text-foreground">No applications found</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try adjusting your filters or create a new application to get started.
      </div>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" />
        Create First Application
      </button>
    </div>
  );
}

/* ---------------- Drawer ---------------- */

function DetailsDrawer({ app, onClose }: { app: Application; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="font-mono text-primary">{app.id}</span>
              <span>·</span>
              <span>{app.date}</span>
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">{app.name}</div>
            <div className="text-xs text-muted-foreground">{app.email}</div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-6">
          {/* Current Status */}
          <Section title="Current Status">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1", STATUS_STYLES[app.status])}>
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[app.status])} />
                {app.status}
              </span>
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-border bg-background text-foreground">
                {app.statusLabel}
              </span>
              <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1", FEE_STYLES[app.feeStatus])}>
                Fee: {app.feeStatus}
              </span>
            </div>
          </Section>

          <Section title="Student Information">
            <Grid2>
              <Field icon={UserIcon} label="Full Name" value={app.name} />
              <Field icon={Mail} label="Email" value={app.email} />
              <Field icon={Phone} label="Phone" value={app.phone} />
              <Field icon={MessageCircle} label="WhatsApp" value={app.whatsapp ? "Available" : "Not available"} />
            </Grid2>
          </Section>

          <Section title="University & Course">
            <Grid2>
              <Field icon={Building2} label="University" value={app.university} />
              <Field icon={BookOpen} label="Course" value={app.course} />
              <Field icon={Layers} label="Batch" value={app.batch} />
              <Field icon={UserIcon} label="Counsellor" value={app.counsellor} />
            </Grid2>
          </Section>

          <Section title="Fee Information">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Recorded Amount" value={formatINR(app.amount)} accent />
              <Stat label="Paid On" value={app.paidDate} />
            </div>
          </Section>

          <Section title="Application Timeline">
            <ol className="relative space-y-4 border-l border-border pl-5">
              {[
                { t: "Application created", d: app.date, by: app.counsellor },
                app.paidDate !== "—"
                  ? { t: "Registration fee paid", d: app.paidDate, by: app.counsellor }
                  : null,
                { t: `Lifecycle: ${app.statusLabel}`, d: app.date, by: app.counsellor },
              ]
                .filter((e): e is { t: string; d: string; by: string } => e !== null)
                .map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full bg-primary ring-4 ring-primary/15" />
                    <div className="text-sm font-medium text-foreground">{e.t}</div>
                    <div className="text-[11px] text-muted-foreground">{e.d} · {e.by}</div>
                  </li>
                ))}
            </ol>
          </Section>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-background/50 px-6 py-3">
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
            <Sparkles className="h-3.5 w-3.5" /> Add Note
          </button>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
              Change Status
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              <Pencil className="h-3.5 w-3.5" /> Edit Application
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", accent ? "border-accent/30 bg-accent/5" : "border-border bg-background")}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-base font-bold", accent ? "text-accent" : "text-foreground")}>{value}</div>
    </div>
  );
}

/* ---------------- Add Lead Dialog ---------------- */

interface AddLeadDialogProps {
  open: boolean;
  onClose: () => void;
  universityOptions: string[];
  courseOptions: string[];
  batchOptions: string[];
  counsellorOptions: string[];
}

function AddLeadDialog({
  open,
  onClose,
  universityOptions,
  courseOptions,
  batchOptions,
  counsellorOptions,
}: AddLeadDialogProps) {
  const [step, setStep] = useState<"form" | "success">("form");
  const [leadId, setLeadId] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadUni, setLeadUni] = useState("");
  const [leadCourse, setLeadCourse] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    university: "",
    course: "",
    specialisation: "",
    intake: "",
    source: "",
    referredBy: "",
    remarks: "",
    counsellor: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setStep("form");
    setLeadId("");
    setLeadName("");
    setLeadUni("");
    setLeadCourse("");
    setForm({
      name: "",
      email: "",
      phone: "",
      university: "",
      course: "",
      specialisation: "",
      intake: "",
      source: "",
      referredBy: "",
      remarks: "",
      counsellor: "",
    });
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Lead name is required";
    if (!form.email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Invalid email address";
    if (!form.phone.trim()) next.phone = "Contact number is required";
    if (!form.university) next.university = "University is required";
    if (!form.course) next.course = "Course is required";
    if (!form.intake) next.intake = "Intake is required";
    if (!form.source) next.source = "Source is required";
    if (form.source === "Referral" && !form.referredBy.trim()) next.referredBy = "Referred by is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const id = `LEAD-2026-${String(Math.floor(Math.random() * 900000) + 100000).padStart(6, "0")}`;
    setLeadId(id);
    setLeadName(form.name);
    setLeadUni(form.university);
    setLeadCourse(form.course);
    setStep("success");
  };

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        {step === "form" ? (
          <>
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="text-xl font-semibold">Add New Lead</DialogTitle>
              <DialogDescription>Capture basic enquiry information.</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5 space-y-4">
              {/* Lead Name */}
              <div className="space-y-1.5">
                <Label htmlFor="lead-name">Lead Name <span className="text-accent">*</span></Label>
                <Input
                  id="lead-name"
                  placeholder="Enter student name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className={cn(errors.name && "border-red-400 focus-visible:ring-red-300")}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email">Email Address <span className="text-accent">*</span></Label>
                  <Input
                    id="lead-email"
                    type="email"
                    placeholder="student@email.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className={cn(errors.email && "border-red-400 focus-visible:ring-red-300")}
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>
                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="lead-phone">Contact Number <span className="text-accent">*</span></Label>
                  <Input
                    id="lead-phone"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className={cn(errors.phone && "border-red-400 focus-visible:ring-red-300")}
                  />
                  {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* University */}
                <div className="space-y-1.5">
                  <Label>University <span className="text-accent">*</span></Label>
                  <Select value={form.university} onValueChange={(v) => update("university", v)}>
                    <SelectTrigger className={cn(errors.university && "border-red-400 focus:ring-red-300")}>
                      <SelectValue placeholder="Select university" />
                    </SelectTrigger>
                    <SelectContent>
                      {universityOptions.length === 0 ? (
                        <SelectItem value="__none" disabled>No universities available</SelectItem>
                      ) : (
                        universityOptions.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.university && <p className="text-xs text-red-500">{errors.university}</p>}
                </div>
                {/* Course */}
                <div className="space-y-1.5">
                  <Label>Course <span className="text-accent">*</span></Label>
                  <Select value={form.course} onValueChange={(v) => update("course", v)}>
                    <SelectTrigger className={cn(errors.course && "border-red-400 focus:ring-red-300")}>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseOptions.length === 0 ? (
                        <SelectItem value="__none" disabled>No courses available</SelectItem>
                      ) : (
                        courseOptions.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.course && <p className="text-xs text-red-500">{errors.course}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Specialisation */}
                <div className="space-y-1.5">
                  <Label htmlFor="lead-spec">Specialisation</Label>
                  <Input
                    id="lead-spec"
                    placeholder="e.g. Finance, HR"
                    value={form.specialisation}
                    onChange={(e) => update("specialisation", e.target.value)}
                  />
                </div>
                {/* Intake */}
                <div className="space-y-1.5">
                  <Label>Intake <span className="text-accent">*</span></Label>
                  <Select value={form.intake} onValueChange={(v) => update("intake", v)}>
                    <SelectTrigger className={cn(errors.intake && "border-red-400 focus:ring-red-300")}>
                      <SelectValue placeholder="Select intake" />
                    </SelectTrigger>
                    <SelectContent>
                      {batchOptions.length === 0 ? (
                        <SelectItem value="__none" disabled>No intakes available</SelectItem>
                      ) : (
                        batchOptions.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.intake && <p className="text-xs text-red-500">{errors.intake}</p>}
                </div>
              </div>

              {/* Source */}
              <div className="space-y-1.5">
                <Label>Source <span className="text-accent">*</span></Label>
                <Select value={form.source} onValueChange={(v) => update("source", v)}>
                  <SelectTrigger className={cn(errors.source && "border-red-400 focus:ring-red-300")}>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Website", "Walk-in", "Phone Enquiry", "Referral", "Social Media", "Email Campaign", "Education Fair", "Google Ads"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.source && <p className="text-xs text-red-500">{errors.source}</p>}
              </div>

              {/* Referred By - conditional */}
              {form.source === "Referral" && (
                <div className="space-y-1.5">
                  <Label htmlFor="lead-referred">Referred By <span className="text-accent">*</span></Label>
                  <Input
                    id="lead-referred"
                    placeholder="Search student or enter referrer name"
                    value={form.referredBy}
                    onChange={(e) => update("referredBy", e.target.value)}
                    className={cn(errors.referredBy && "border-red-400 focus-visible:ring-red-300")}
                  />
                  {errors.referredBy && <p className="text-xs text-red-500">{errors.referredBy}</p>}
                </div>
              )}

              {/* Remarks */}
              <div className="space-y-1.5">
                <Label htmlFor="lead-remarks">Quick Notes</Label>
                <Textarea
                  id="lead-remarks"
                  placeholder="Add enquiry notes, student requirements, preferred timing, or counsellor observations."
                  rows={3}
                  value={form.remarks}
                  onChange={(e) => update("remarks", e.target.value)}
                />
              </div>

              {/* Assigned Counsellor */}
              <div className="space-y-1.5">
                <Label>Assigned Counsellor</Label>
                <Select value={form.counsellor} onValueChange={(v) => update("counsellor", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select counsellor" />
                  </SelectTrigger>
                  <SelectContent>
                    {counsellorOptions.length === 0 ? (
                      <SelectItem value="__none" disabled>No counsellors available</SelectItem>
                    ) : (
                      counsellorOptions.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save Lead
              </button>
            </div>
          </>
        ) : (
          /* Success State */
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <DialogTitle className="text-xl font-semibold">Lead Created Successfully</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              New lead has been captured and assigned.
            </DialogDescription>

            <div className="mt-6 w-full space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Lead ID</span>
                <span className="font-mono font-semibold text-foreground">{leadId}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Lead Name</span>
                <span className="font-semibold text-foreground">{leadName}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">University</span>
                <span className="font-semibold text-foreground">{leadUni}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Course</span>
                <span className="font-semibold text-foreground">{leadCourse}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  New Lead
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Created On</span>
                <span className="font-semibold text-foreground">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Close
              </button>
              <button
                onClick={() => {
                  reset();
                  setStep("form");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow transition hover:bg-accent-hover"
              >
                <Eye className="h-4 w-4" />
                View Lead
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
