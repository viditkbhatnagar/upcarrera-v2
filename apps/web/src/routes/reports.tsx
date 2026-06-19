import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Bookmark,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  History,
  Layers,
  Loader2,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — upCarrera" }] }),
  component: ReportsPage,
});

/* -------------------------------------------------------------------------- */
/* API response shapes (mirror apps/api/src/reports/reports.service.ts)        */
/* -------------------------------------------------------------------------- */

interface LeadsReport {
  total: number;
  by_status: Array<{ lead_status_id: number | null; count: number }>;
  by_source: Array<{ lead_source_id: string | null; count: number }>;
}

interface StudentsReport {
  total: number;
  by_admission_status: Array<{ admission_status: number | null; count: number }>;
  by_course: Array<{ course_id: number | null; count: number }>;
}

interface IncomeReport {
  grand_total: number;
  by_month: Array<{ month: string; total: number }>;
}

interface InvoicesReport {
  rows: Array<{
    id: number;
    student_id: number | null;
    student_name: string | null;
    course_id: number | null;
    course_name: string | null;
    date: string | null;
    due_date: string | null;
    total_amount: number;
    discount_amount: number;
    payable_amount: number;
    total_paid: number;
    payment_count: number;
  }>;
  totals: {
    total_amount: number;
    discount_amount: number;
    payable_amount: number;
    total_paid: number;
    count: number;
  };
}

interface FeePaymentReport {
  rows: Array<{
    student_id: number;
    student_name: string | null;
    email: string | null;
    university_id: number | null;
    finance_id: number | null;
    tuition_fees: number;
    exam_fees: number;
    misc_fees: number;
    scholarship_details: string | null;
    payment_status: string | null;
  }>;
  totals: { tuition_fees: number; exam_fees: number; misc_fees: number; count: number };
}

interface CoursesReport {
  active_count: number;
  inactive_count: number;
  total: number;
  rows: Array<{
    id: number;
    title: string | null;
    level: string | null;
    stream: string | null;
    university_id: number | null;
    status: number | null;
    created_at: string | null;
  }>;
}

interface ConsultantPerformanceReport {
  rows: Array<{
    consultant_id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    status: number | null;
    total_students: number;
    total_revenue: number;
  }>;
  totals: { total_students: number; total_revenue: number; consultants: number };
}

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                          */
/* -------------------------------------------------------------------------- */

const EMPTY = "—";

function formatInr(amount: number): string {
  return `₹ ${(Number(amount) || 0).toLocaleString("en-IN")}`;
}

function formatNum(n: number): string {
  return (Number(n) || 0).toLocaleString("en-IN");
}

function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// "2026-06" -> "Jun 2026"
function formatMonth(value: string): string {
  if (!value) return EMPTY;
  const [y, m] = value.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function asText(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

// Students admission_status codes (matches reports.service ADMISSION_STATUS).
const ADMISSION_STATUS_LABELS: Record<string, string> = {
  "0": "Pending",
  "1": "In Progress",
  "2": "Enrolled",
  "3": "Passout",
  "4": "Dropout",
  "5": "Cancelled",
};

// Lead status codes -> human label (legacy lead_status_id mapping).
const LEAD_STATUS_LABELS: Record<string, string> = {
  "1": "New",
  "2": "Contacted",
  "3": "Follow-up",
  "4": "Qualified",
  "5": "Converted",
  "6": "Lost",
};

function consultantStatusLabel(status: number | null): string {
  if (status === 1) return "Active";
  if (status === 0) return "Inactive";
  return status == null ? EMPTY : String(status);
}

/* -------------------------------------------------------------------------- */
/* Report catalogue (UI definitions — unchanged from the new design)           */
/* -------------------------------------------------------------------------- */

type CategoryKey =
  | "admissions"
  | "finance"
  | "students"
  | "performance"
  | "administration";

// Which live report endpoint backs each report id. Reports without an endpoint
// render a graceful "No data" table (the API has no source for them yet).
type ReportEndpoint =
  | "leads"
  | "students"
  | "income"
  | "invoices"
  | "fee-payment"
  | "courses"
  | "consultant-performance"
  | null;

interface ReportDef {
  id: string;
  name: string;
  description: string;
  bestUsedBy: string;
  dataSource: string;
  filters: string[];
  defaultColumns: string[];
  allColumns: string[];
  endpoint: ReportEndpoint;
}

interface CategoryDef {
  key: CategoryKey;
  name: string;
  description: string;
  icon: typeof BarChart3;
  tone: string;
  reports: ReportDef[];
}

const COMMON_EXTRA = [
  "Created By",
  "Updated Date",
  "Branch",
  "Group",
  "Remarks",
];

const CATEGORIES: CategoryDef[] = [
  {
    key: "admissions",
    name: "Admissions Reports",
    description: "Application pipeline, lead sources, university and course performance.",
    icon: ClipboardList,
    tone: "from-sky-500/15 to-sky-500/0 text-sky-700 ring-sky-500/20",
    reports: [
      {
        id: "app-status",
        name: "Application Status Report",
        description: "Track applications by current status across the admission pipeline.",
        bestUsedBy: "Admission Operations, Counsellor Managers, Management",
        dataSource: "Applications, Students, Counsellors",
        filters: ["Date Range", "University", "Course", "Intake", "Counsellor", "Application Status", "Lead Source"],
        defaultColumns: [
          "Application ID", "Student Name", "Phone", "University", "Course",
          "Intake", "Counsellor", "Application Status", "Registration Fee Status", "Created Date",
        ],
        allColumns: [
          "Application ID", "Student Name", "Phone", "Email", "University", "Course",
          "Intake", "Counsellor", "Team", "Application Status", "Registration Fee Status",
          "Lead Source", "Created Date", ...COMMON_EXTRA,
        ],
        endpoint: "fee-payment",
      },
      {
        id: "lead-source",
        name: "Lead Source Report",
        description: "Analyze lead sources and conversion across channels.",
        bestUsedBy: "Management, Admission Operations",
        dataSource: "Leads, Applications, Enrollments",
        filters: ["Date Range", "Lead Source", "University", "Course", "Counsellor"],
        defaultColumns: ["Source", "Leads", "Applications", "Enrollments", "Conversion %"],
        allColumns: ["Source", "Leads", "Applications", "Enrollments", "Conversion %", "Revenue", "Top Counsellor"],
        endpoint: "leads",
      },
      {
        id: "uni-admission",
        name: "University Admission Report",
        description: "Track applications and enrollments by university.",
        bestUsedBy: "Management, Admission Operations",
        dataSource: "Universities, Applications, Enrollments",
        filters: ["Date Range", "University", "Intake", "Course"],
        defaultColumns: ["University", "Applications", "Enrollments", "Revenue"],
        allColumns: ["University", "Applications", "Enrollments", "Conversion %", "Revenue", "Outstanding"],
        endpoint: null,
      },
      {
        id: "course-admission",
        name: "Course Admission Report",
        description: "Track applications and enrollments by course.",
        bestUsedBy: "Management, Admission Operations",
        dataSource: "Courses, Applications, Enrollments",
        filters: ["Date Range", "Course", "University", "Intake"],
        defaultColumns: ["Course", "Applications", "Enrollments", "Revenue"],
        allColumns: ["Course", "University", "Applications", "Enrollments", "Conversion %", "Revenue"],
        endpoint: "courses",
      },
    ],
  },
  {
    key: "finance",
    name: "Finance Reports",
    description: "Collections, outstanding balances, due payments and receipts.",
    icon: Wallet,
    tone: "from-emerald-500/15 to-emerald-500/0 text-emerald-700 ring-emerald-500/20",
    reports: [
      {
        id: "collection-summary",
        name: "Collection Summary Report",
        description: "Total fee collection summary with date-wise breakdown.",
        bestUsedBy: "Finance Team, Management",
        dataSource: "Payments, Student Fee Records",
        filters: ["Date Range", "University", "Course", "Payment Mode"],
        defaultColumns: ["Date", "Total Collected", "Outstanding", "Collection %"],
        allColumns: ["Date", "Total Collected", "Outstanding", "Collection %", "Payments Count", "Avg Ticket"],
        endpoint: "income",
      },
      {
        id: "outstanding",
        name: "Outstanding Fee Report",
        description: "Students with pending fee balances, overdue payments and next due dates.",
        bestUsedBy: "Finance Team, Student Support Team, Management",
        dataSource: "Student Fee Records, Payment Records, Installments",
        filters: ["University", "Course", "Intake", "Student Status", "Fee Status", "Due Date Range", "Overdue Days", "Support Executive"],
        defaultColumns: [
          "Student ID", "Student Name", "University", "Course", "Intake",
          "Total Fee", "Paid Amount", "Outstanding Balance", "Next Due Date", "Overdue Days", "Support Executive",
        ],
        allColumns: [
          "Student ID", "Student Name", "Phone", "University", "Course", "Intake",
          "Total Fee", "Paid Amount", "Outstanding Balance", "Next Due Date", "Overdue Days",
          "Support Executive", "Counsellor", ...COMMON_EXTRA,
        ],
        endpoint: "invoices",
      },
      {
        id: "due-payment",
        name: "Due Payment Report",
        description: "Track upcoming and overdue payments by bucket.",
        bestUsedBy: "Finance Team, Student Support Team",
        dataSource: "Installments, Payments",
        filters: ["Due Date Range", "University", "Course", "Overdue Days"],
        defaultColumns: ["Student", "Due Today", "Due This Week", "Due This Month", "Overdue"],
        allColumns: ["Student", "Course", "Due Today", "Due This Week", "Due This Month", "Overdue", "Support Executive"],
        endpoint: null,
      },
      {
        id: "payment-register",
        name: "Payment Register",
        description: "Complete list of all payments received.",
        bestUsedBy: "Finance Team, Management",
        dataSource: "Payments, Receipts",
        filters: ["Payment Date Range", "University", "Course", "Payment Mode", "Verified By", "Payment Status"],
        defaultColumns: [
          "Receipt No", "Student Name", "University", "Course",
          "Payment Date", "Amount", "Payment Mode", "Transaction ID", "Verified By", "Status",
        ],
        allColumns: [
          "Receipt No", "Student Name", "Student ID", "University", "Course",
          "Payment Date", "Amount", "Payment Mode", "Transaction ID", "Verified By", "Status", ...COMMON_EXTRA,
        ],
        endpoint: "invoices",
      },
    ],
  },
  {
    key: "students",
    name: "Student Reports",
    description: "Active students, status distribution and support tracking.",
    icon: GraduationCap,
    tone: "from-violet-500/15 to-violet-500/0 text-violet-700 ring-violet-500/20",
    reports: [
      {
        id: "active-students",
        name: "Active Student Report",
        description: "All active enrolled students with course and support details.",
        bestUsedBy: "Student Support Team, Management",
        dataSource: "Students, Enrollments",
        filters: ["University", "Course", "Intake", "Support Executive", "Fee Status"],
        defaultColumns: [
          "Student ID", "Student", "University", "Course", "Intake", "Support Executive", "Fee Status",
        ],
        allColumns: [
          "Student ID", "Student", "Phone", "Email", "University", "Course",
          "Intake", "Support Executive", "Counsellor", "Fee Status", ...COMMON_EXTRA,
        ],
        endpoint: "fee-payment",
      },
      {
        id: "student-status",
        name: "Student Status Report",
        description: "Group students by lifecycle status.",
        bestUsedBy: "Student Support Team, Management",
        dataSource: "Students",
        filters: ["Date Range", "Student Status", "University", "Course"],
        defaultColumns: ["Status", "Count", "% Share"],
        allColumns: ["Status", "Count", "% Share", "Revenue Impact", "Owner"],
        endpoint: "students",
      },
    ],
  },
  {
    key: "performance",
    name: "Performance Reports",
    description: "Counsellor, team and target achievement performance.",
    icon: TrendingUp,
    tone: "from-amber-500/15 to-amber-500/0 text-amber-700 ring-amber-500/20",
    reports: [
      {
        id: "counsellor-performance",
        name: "Counsellor Performance Report",
        description: "Individual counsellor performance across applications, enrollments and revenue.",
        bestUsedBy: "Counsellor Managers, Management",
        dataSource: "Counsellors, Applications, Enrollments, Targets",
        filters: ["Date Range", "Counsellor", "Team", "Group", "Target Month"],
        defaultColumns: [
          "Counsellor Name", "Team", "Group", "Admission Target", "Admissions Achieved",
          "Revenue Target", "Revenue Achieved", "Achievement %", "Conversion Rate",
        ],
        allColumns: [
          "Counsellor Name", "Employee ID", "Team", "Group", "Admission Target", "Admissions Achieved",
          "Revenue Target", "Revenue Achieved", "Achievement %", "Conversion Rate", "Active Days", "Last Activity",
        ],
        endpoint: "consultant-performance",
      },
      {
        id: "team-performance",
        name: "Team Performance Report",
        description: "Team-wise performance and achievement.",
        bestUsedBy: "Counsellor Managers, Management",
        dataSource: "Teams, Counsellors, Targets",
        filters: ["Date Range", "Team", "Group", "Target Month"],
        defaultColumns: [
          "Team", "Team Leader", "Applications", "Enrollments", "Revenue", "Target Achievement",
        ],
        allColumns: [
          "Team", "Team Leader", "Counsellor Count", "Applications", "Enrollments", "Revenue",
          "Target", "Target Achievement", "Conversion Rate",
        ],
        endpoint: null,
      },
      {
        id: "target-achievement",
        name: "Target Achievement Report",
        description: "Compare targets vs actuals across periods.",
        bestUsedBy: "Management, Counsellor Managers",
        dataSource: "Targets, Enrollments, Payments",
        filters: ["Date Range", "Counsellor", "Team", "Target Month"],
        defaultColumns: ["Owner", "Target", "Achieved", "Pending", "Achievement %"],
        allColumns: ["Owner", "Type", "Target", "Achieved", "Pending", "Achievement %", "Period"],
        endpoint: "consultant-performance",
      },
    ],
  },
  {
    key: "administration",
    name: "Administration Reports",
    description: "User activity and audit log compliance reports.",
    icon: Shield,
    tone: "from-rose-500/15 to-rose-500/0 text-rose-700 ring-rose-500/20",
    reports: [
      {
        id: "user-activity",
        name: "User Activity Report",
        description: "Admin user activity, logins and actions performed.",
        bestUsedBy: "Admin Users, Management",
        dataSource: "System Users, Activity Logs",
        filters: ["Date Range", "User", "Department", "Status"],
        defaultColumns: ["User", "Department", "Actions", "Login Activity", "Status"],
        allColumns: ["User", "Employee ID", "Department", "Designation", "Actions", "Login Activity", "Last Login", "Status"],
        endpoint: null,
      },
      {
        id: "audit-log",
        name: "Audit Log Report",
        description: "Track important system and business actions with old/new values.",
        bestUsedBy: "Admin Users, Compliance, Management",
        dataSource: "Audit Logs",
        filters: ["Date Range", "User", "Module", "Action Type", "Status", "IP Address"],
        defaultColumns: ["Date", "User", "Module", "Action", "Old Value", "New Value", "IP Address"],
        allColumns: ["Date", "Time", "User", "Department", "Module", "Action", "Record ID", "Old Value", "New Value", "Status", "IP Address", "Device"],
        endpoint: null,
      },
    ],
  },
];

const ALL_REPORTS: { category: CategoryDef; report: ReportDef }[] =
  CATEGORIES.flatMap((c) => c.reports.map((r) => ({ category: c, report: r })));

const SAVED_REPORTS = [
  { name: "Monthly Outstanding — North", type: "Outstanding Fee Report", by: "Sneha Iyer", last: "12 Jun 2026", visibility: "Team" },
  { name: "Top Counsellors Q2", type: "Counsellor Performance Report", by: "Arjun Rao", last: "10 Jun 2026", visibility: "Private" },
  { name: "Daily Payment Register", type: "Payment Register", by: "Karan Malhotra", last: "16 Jun 2026", visibility: "Public" },
  { name: "Lead Source — Spring Intake", type: "Lead Source Report", by: "Divya Nair", last: "08 Jun 2026", visibility: "Team" },
];

const EXPORT_HISTORY = [
  { name: "Outstanding Fee Report", by: "Sneha Iyer", date: "16 Jun 2026 10:24", type: "Excel", count: 312 },
  { name: "Payment Register", by: "Karan Malhotra", date: "16 Jun 2026 09:10", type: "PDF", count: 187 },
  { name: "Counsellor Performance Report", by: "Arjun Rao", date: "15 Jun 2026 18:42", type: "Excel", count: 64 },
  { name: "Audit Log Report", by: "Admin", date: "15 Jun 2026 15:31", type: "CSV", count: 2104 },
  { name: "Application Status Report", by: "Divya Nair", date: "14 Jun 2026 11:05", type: "Excel", count: 921 },
];

/* -------------------------------------------------------------------------- */
/* Live data: fetch + map each report's API response into Record<col,string>   */
/* -------------------------------------------------------------------------- */

type Row = Record<string, string>;

// Pull the from/to date range out of the wizard's date-range filter value
// (stored as "from|to" by FilterField). Returns ISO date strings (or "").
function dateRangeFromFilters(filters: Record<string, string>): { from: string; to: string } {
  // The new design names date filters variously: "Date Range", "Due Date Range",
  // "Payment Date Range". Take the first date-typed filter present.
  for (const [k, v] of Object.entries(filters)) {
    if (k.toLowerCase().includes("date") && v) {
      const [from = "", to = ""] = v.split("|");
      return { from: from || "", to: to || "" };
    }
  }
  return { from: "", to: "" };
}

// Builds a row object for the given report's columns from a per-record value
// resolver. Columns the API can't supply fall back to "—".
function rowFor(columns: string[], resolve: (col: string) => string | undefined): Row {
  const row: Row = {};
  for (const col of columns) {
    const v = resolve(col);
    row[col] = v != null && v !== "" ? v : EMPTY;
  }
  return row;
}

/**
 * Fetches the live data for one report (by endpoint) and maps it onto the
 * report's selected columns. Reports with no endpoint resolve to an empty set.
 * Returns { rows, total, isLoading, isError, error } so the preview can render
 * loading / error / empty states.
 */
function useReportRows(
  report: ReportDef | null,
  columns: string[],
  filters: Record<string, string>,
) {
  const endpoint = report?.endpoint ?? null;
  const { from, to } = dateRangeFromFilters(filters);
  const searchKey = filters["Counsellor"] && filters["Counsellor"] !== "All"
    ? filters["Counsellor"]
    : "";

  const query = useQuery({
    enabled: !!endpoint,
    queryKey: ["reports", endpoint, { from, to, searchKey }],
    queryFn: async () => {
      switch (endpoint) {
        case "leads":
          return apiGet<LeadsReport>("/reports/leads", { from: from || undefined, to: to || undefined });
        case "students":
          return apiGet<StudentsReport>("/reports/students", { from: from || undefined, to: to || undefined });
        case "income":
          return apiGet<IncomeReport>("/reports/income", { from: from || undefined, to: to || undefined });
        case "invoices":
          return apiGet<InvoicesReport>("/reports/invoices", {
            from_date: from || undefined,
            to_date: to || undefined,
          });
        case "fee-payment":
          return apiGet<FeePaymentReport>("/reports/fee-payment", {
            from_date: from || undefined,
            to_date: to || undefined,
          });
        case "courses":
          return apiGet<CoursesReport>("/reports/courses", {
            from_date: from || undefined,
            to_date: to || undefined,
          });
        case "consultant-performance":
          return apiGet<ConsultantPerformanceReport>("/reports/consultant-performance", {
            search_key: searchKey || undefined,
          });
        default:
          return null;
      }
    },
  });

  const rows = useMemo<Row[]>(() => {
    if (!report || !endpoint || !query.data) return [];
    return mapReportRows(report, columns, query.data);
  }, [report, endpoint, columns, query.data]);

  return {
    rows,
    isLoading: !!endpoint && query.isLoading,
    isError: query.isError,
    error: query.error,
    hasEndpoint: !!endpoint,
  };
}

// Per-report mapper: turns an API response into rows keyed by the design's
// column names. Only fields the API genuinely exposes are filled; everything
// else falls through to "—" via rowFor().
function mapReportRows(report: ReportDef, columns: string[], data: unknown): Row[] {
  switch (report.endpoint) {
    case "leads": {
      const d = data as LeadsReport;
      return d.by_source.map((s) =>
        rowFor(columns, (col) => {
          const lc = col.toLowerCase();
          if (lc === "source") return s.lead_source_id == null || s.lead_source_id === "" ? "Unknown" : s.lead_source_id;
          if (lc === "leads") return formatNum(s.count);
          if (lc === "top counsellor") return EMPTY;
          return undefined;
        }),
      );
    }
    case "students": {
      const d = data as StudentsReport;
      const total = d.total || 0;
      return d.by_admission_status.map((s) =>
        rowFor(columns, (col) => {
          const lc = col.toLowerCase();
          const label =
            s.admission_status == null
              ? "Unassigned"
              : ADMISSION_STATUS_LABELS[String(s.admission_status)] ?? `Status ${s.admission_status}`;
          if (lc === "status") return label;
          if (lc === "count") return formatNum(s.count);
          if (lc.includes("%") || lc.includes("share"))
            return total > 0 ? `${Math.round((s.count / total) * 100)}%` : "0%";
          return undefined;
        }),
      );
    }
    case "income": {
      const d = data as IncomeReport;
      return d.by_month.map((m) =>
        rowFor(columns, (col) => {
          const lc = col.toLowerCase();
          if (lc === "date") return formatMonth(m.month);
          if (lc.includes("total collected") || lc === "amount") return formatInr(m.total);
          return undefined;
        }),
      );
    }
    case "invoices": {
      const d = data as InvoicesReport;
      return d.rows.map((r) =>
        rowFor(columns, (col) => {
          const lc = col.toLowerCase();
          if (lc.includes("receipt")) return `INV-${r.id}`;
          if (lc.includes("student id")) return r.student_id != null ? String(r.student_id) : undefined;
          if (lc.includes("student")) return asText(r.student_name);
          if (lc === "course") return asText(r.course_name);
          if (lc.includes("payment date") || lc.includes("created date") || lc === "date")
            return formatDate(r.date);
          if (lc.includes("next due date")) return formatDate(r.due_date);
          if (lc === "amount" || lc.includes("total fee")) return formatInr(r.payable_amount);
          if (lc.includes("paid amount") || lc.includes("paid")) return formatInr(r.total_paid);
          if (lc.includes("outstanding")) return formatInr(Math.max(0, r.payable_amount - r.total_paid));
          if (lc.includes("status")) return r.total_paid >= r.payable_amount && r.payable_amount > 0 ? "Paid" : "Pending";
          if (lc === "payments count") return formatNum(r.payment_count);
          return undefined;
        }),
      );
    }
    case "fee-payment": {
      const d = data as FeePaymentReport;
      return d.rows.map((r) => {
        const totalFee = r.tuition_fees + r.exam_fees + r.misc_fees;
        return rowFor(columns, (col) => {
          const lc = col.toLowerCase();
          if (lc.includes("application id")) return `APP-${r.student_id}`;
          if (lc.includes("student id")) return String(r.student_id);
          if (lc.includes("student") || lc.includes("name")) return asText(r.student_name);
          if (lc === "email") return asText(r.email);
          if (lc === "university") return r.university_id != null ? `University #${r.university_id}` : undefined;
          if (lc.includes("fee status") || lc.includes("registration fee status")) return asText(r.payment_status);
          if (lc.includes("status")) return asText(r.payment_status);
          if (lc.includes("total fee")) return formatInr(totalFee);
          return undefined;
        });
      });
    }
    case "courses": {
      const d = data as CoursesReport;
      return d.rows.map((r) =>
        rowFor(columns, (col) => {
          const lc = col.toLowerCase();
          if (lc === "course") return asText(r.title);
          if (lc === "university") return r.university_id != null ? `University #${r.university_id}` : undefined;
          if (lc === "created date") return formatDate(r.created_at);
          return undefined;
        }),
      );
    }
    case "consultant-performance": {
      const d = data as ConsultantPerformanceReport;
      return d.rows.map((r) =>
        rowFor(columns, (col) => {
          const lc = col.toLowerCase();
          if (lc.includes("counsellor name") || lc === "owner" || lc === "user")
            return asText(r.name);
          if (lc.includes("employee id")) return `UC-${r.consultant_id}`;
          if (lc.includes("admissions achieved") || lc === "achieved") return formatNum(r.total_students);
          if (lc.includes("revenue achieved") || lc === "revenue") return formatInr(r.total_revenue);
          if (lc.includes("status")) return consultantStatusLabel(r.status);
          if (lc === "email") return asText(r.email);
          if (lc === "phone") return asText(r.phone);
          return undefined;
        }),
      );
    }
    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

type Step = 1 | 2 | 3 | 4;
type View = "workflow" | "saved" | "history";

function ReportsPage() {
  const [view, setView] = useState<View>("workflow");
  const [step, setStep] = useState<Step>(1);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("admissions");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  const selected = useMemo(
    () => ALL_REPORTS.find((r) => r.report.id === selectedReportId) ?? null,
    [selectedReportId],
  );

  const handlePickReport = (id: string) => {
    const found = ALL_REPORTS.find((r) => r.report.id === id);
    if (!found) return;
    setSelectedReportId(id);
    setSelectedColumns(found.report.defaultColumns);
    setFilterValues({});
  };

  const goToStep = (s: Step) => {
    if (s > 1 && !selectedReportId) return;
    setStep(s);
  };

  // Live rows for the chosen report, mapped onto the selected columns.
  const { rows, isLoading, isError, error, hasEndpoint } = useReportRows(
    selected?.report ?? null,
    selectedColumns,
    filterValues,
  );

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reports
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate reports with filters and downloadable outputs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("saved")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
              view === "saved"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground hover:bg-muted",
            )}
          >
            <Bookmark className="h-4 w-4" />
            Saved Reports
          </button>
          <button
            onClick={() => setView("history")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
              view === "history"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground hover:bg-muted",
            )}
          >
            <History className="h-4 w-4" />
            Export History
          </button>
          {view !== "workflow" && (
            <button
              onClick={() => setView("workflow")}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Reports
            </button>
          )}
        </div>
      </div>

      {view === "saved" && <SavedReportsView onOpen={() => setView("workflow")} />}
      {view === "history" && <ExportHistoryView />}

      {view === "workflow" && (
        <>
          {/* Step indicator */}
          <StepIndicator step={step} onJump={goToStep} canAdvance={!!selectedReportId} />

          {step === 1 && (
            <Step1ChooseReport
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              selectedReportId={selectedReportId}
              onPick={handlePickReport}
              selected={selected}
              onContinue={() => goToStep(2)}
            />
          )}

          {step === 2 && selected && (
            <Step2Filters
              report={selected.report}
              values={filterValues}
              onChange={setFilterValues}
              onBack={() => goToStep(1)}
              onContinue={() => goToStep(3)}
            />
          )}

          {step === 3 && selected && (
            <Step3Columns
              report={selected.report}
              selected={selectedColumns}
              onChange={setSelectedColumns}
              onBack={() => goToStep(2)}
              onContinue={() => goToStep(4)}
            />
          )}

          {step === 4 && selected && (
            <Step4Generate
              report={selected.report}
              columns={selectedColumns}
              filterValues={filterValues}
              rows={filteredRows}
              totalRows={rows.length}
              search={search}
              setSearch={setSearch}
              isLoading={isLoading}
              isError={isError}
              error={error}
              hasEndpoint={hasEndpoint}
              onBack={() => goToStep(3)}
              onSave={() => setSaveOpen(true)}
            />
          )}
        </>
      )}

      {saveOpen && <SaveReportDialog onClose={() => setSaveOpen(false)} reportName={selected?.report.name ?? ""} />}
    </div>
  );
}

/* ---------------- Step Indicator ---------------- */

const STEPS: { n: Step; label: string; sub: string }[] = [
  { n: 1, label: "Choose Report", sub: "Pick a report from a category" },
  { n: 2, label: "Apply Filters", sub: "Narrow the data" },
  { n: 3, label: "Select Columns", sub: "Customize the view" },
  { n: 4, label: "Generate & Download", sub: "Preview and export" },
];

function StepIndicator({
  step,
  onJump,
  canAdvance,
}: {
  step: Step;
  onJump: (s: Step) => void;
  canAdvance: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-1 md:grid-cols-4">
        {STEPS.map((s, idx) => {
          const isActive = s.n === step;
          const isDone = s.n < step;
          const disabled = s.n > 1 && !canAdvance;
          return (
            <button
              key={s.n}
              disabled={disabled}
              onClick={() => onJump(s.n)}
              className={cn(
                "group flex items-center gap-3 border-b md:border-b-0 md:border-r border-border px-5 py-4 text-left transition",
                idx === STEPS.length - 1 && "md:border-r-0",
                isActive ? "bg-primary/5" : "bg-surface hover:bg-muted",
                disabled && "opacity-50 cursor-not-allowed hover:bg-surface",
              )}
            >
              <div
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ring-1",
                  isDone
                    ? "bg-emerald-500 text-white ring-emerald-500/30"
                    : isActive
                      ? "bg-primary text-primary-foreground ring-primary/30"
                      : "bg-muted text-muted-foreground ring-border",
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : s.n}
              </div>
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-sm font-semibold",
                    isActive ? "text-foreground" : "text-foreground/80",
                  )}
                >
                  {s.label}
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Step 1 ---------------- */

function Step1ChooseReport({
  activeCategory,
  setActiveCategory,
  selectedReportId,
  onPick,
  selected,
  onContinue,
}: {
  activeCategory: CategoryKey;
  setActiveCategory: (k: CategoryKey) => void;
  selectedReportId: string | null;
  onPick: (id: string) => void;
  selected: { category: CategoryDef; report: ReportDef } | null;
  onContinue: () => void;
}) {
  const cat = CATEGORIES.find((c) => c.key === activeCategory)!;
  return (
    <div className="space-y-5">
      {/* Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const isActive = c.key === activeCategory;
          return (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              className={cn(
                "text-left rounded-2xl border bg-gradient-to-br p-4 transition ring-1 ring-transparent",
                c.tone,
                isActive
                  ? "border-primary ring-primary/30 shadow"
                  : "border-border hover:border-foreground/20",
              )}
            >
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-background/70 ring-1 ring-border">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold rounded-full bg-background/70 px-2 py-0.5 ring-1 ring-border">
                  {c.reports.length}
                </span>
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">{c.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {c.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Reports + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">{cat.name}</div>
            <div className="text-xs text-muted-foreground">{cat.reports.length} reports</div>
          </div>
          <ul className="divide-y divide-border">
            {cat.reports.map((r) => {
              const isSel = r.id === selectedReportId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => onPick(r.id)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition",
                      isSel ? "bg-primary/5" : "hover:bg-muted",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {r.name}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {r.description}
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 transition",
                        isSel ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-border bg-surface p-5">
          {!selected ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {selected.category.name}
                </div>
                <h2 className="mt-1 text-xl font-semibold text-foreground">
                  {selected.report.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.report.description}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailBox label="Best Used By" value={selected.report.bestUsedBy} />
                <DetailBox label="Data Source" value={selected.report.dataSource} />
                <DetailBox
                  label="Default Filters"
                  value={selected.report.filters.join(" • ")}
                />
                <DetailBox
                  label="Default Columns"
                  value={`${selected.report.defaultColumns.length} columns`}
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={onContinue}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
                >
                  Continue to Filters
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <BarChart3 className="h-8 w-8" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        Choose a report to begin.
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Select a report type, apply filters, customize columns, and generate downloadable reports.
      </p>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */

const FILTER_OPTIONS: Record<string, string[]> = {
  University: ["All", "Sunrise University", "Atlas Institute", "Northfield University", "Crescent College"],
  Course: ["All", "MBA", "B.Tech CSE", "BBA", "M.Sc Data Science"],
  Intake: ["All", "Spring 2026", "Fall 2026", "Summer 2026"],
  "Application Status": ["All", "New Lead", "Reg Fee Paid", "Form Pending", "Enrolled", "Rejected"],
  "Student Status": ["All", "Active", "On Hold", "Completed", "At Risk", "Dropout"],
  "Payment Status": ["All", "Paid", "Partial", "Pending", "Overdue"],
  "Fee Status": ["All", "Paid", "Partial", "Pending", "Overdue"],
  "Lead Source": ["All", "Google", "Facebook", "Instagram", "Referral", "Walk-in"],
  "Payment Mode": ["All", "UPI", "Card", "NEFT", "Cash"],
  Counsellor: ["All", "Priya Sharma", "Rohit Verma", "Anjali Mehta", "Vikram Singh"],
  Team: ["All", "Alpha", "Bravo", "Charlie", "Delta"],
  Group: ["All", "North", "South", "East", "West"],
  "Support Executive": ["All", "Sneha Iyer", "Arjun Rao", "Karan Malhotra"],
  User: ["All", "Sneha Iyer", "Arjun Rao", "Karan Malhotra", "Admin"],
  Department: ["All", "Admissions", "Finance", "Support", "Management"],
  "Action Type": ["All", "Created", "Updated", "Deleted", "Verified", "Rejected"],
  Module: ["All", "Students", "Payments", "Counsellors", "Users"],
  Status: ["All", "Success", "Failed", "Warning"],
  "Verified By": ["All", "Sneha Iyer", "Arjun Rao", "Karan Malhotra"],
  "Target Month": ["All", "Apr 2026", "May 2026", "Jun 2026"],
  "Overdue Days": ["All", "0-15", "16-30", "31-60", "60+"],
  "IP Address": ["All"],
};

function Step2Filters({
  report,
  values,
  onChange,
  onBack,
  onContinue,
}: {
  report: ReportDef;
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const update = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Apply Filters</div>
          <span className="text-xs text-muted-foreground">• {report.name}</span>
        </div>
        <button
          onClick={() => onChange({})}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Reset Filters
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
        {report.filters.map((f) => (
          <FilterField
            key={f}
            label={f}
            value={values[f] ?? ""}
            onChange={(v) => update(f, v)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
            <Save className="h-4 w-4" />
            Save Filter Preset
          </button>
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            Continue to Columns
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isDate = label.toLowerCase().includes("date");
  const options = FILTER_OPTIONS[label];

  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {isDate ? (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Input type="date" value={value.split("|")[0] ?? ""} onChange={(e) => onChange(`${e.target.value}|${value.split("|")[1] ?? ""}`)} />
          <Input type="date" value={value.split("|")[1] ?? ""} onChange={(e) => onChange(`${value.split("|")[0] ?? ""}|${e.target.value}`)} />
        </div>
      ) : options ? (
        <Select value={value || "All"} onValueChange={onChange}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={`Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          className="mt-1"
          placeholder={`Enter ${label}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/* ---------------- Step 3 ---------------- */

const COLUMN_VIEWS = ["Default", "Finance View", "Management View", "Counsellor View", "Compact View"];

function Step3Columns({
  report,
  selected,
  onChange,
  onBack,
  onContinue,
}: {
  report: ReportDef;
  selected: string[];
  onChange: (v: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [view, setView] = useState("Default");
  const available = report.allColumns.filter((c) => !selected.includes(c));

  const add = (c: string) => onChange([...selected, c]);
  const remove = (c: string) => onChange(selected.filter((x) => x !== c));
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...selected];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Select Columns</div>
          <span className="text-xs text-muted-foreground">• {report.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={view} onValueChange={setView}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLUMN_VIEWS.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => onChange(report.defaultColumns)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Restore Default
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
        {/* Available */}
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available Columns ({available.length})
            </div>
            <button
              onClick={() => onChange(report.allColumns)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Select All
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-border">
            {available.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                All columns selected.
              </li>
            )}
            {available.map((c) => (
              <li key={c} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted">
                <span className="text-sm text-foreground">{c}</span>
                <button
                  onClick={() => add(c)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Selected */}
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Selected Columns ({selected.length})
            </div>
            <button
              onClick={() => onChange([])}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Clear All
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-border">
            {selected.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                No columns selected.
              </li>
            )}
            {selected.map((c, i) => (
              <li key={c} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid h-5 w-5 place-items-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm text-foreground truncate">{c}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={selected.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          Generate Report
          <Sparkles className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Step 4 ---------------- */

function Step4Generate({
  report,
  columns,
  filterValues,
  rows,
  totalRows,
  search,
  setSearch,
  isLoading,
  isError,
  error,
  hasEndpoint,
  onBack,
  onSave,
}: {
  report: ReportDef;
  columns: string[];
  filterValues: Record<string, string>;
  rows: Record<string, string>[];
  totalRows: number;
  search: string;
  setSearch: (s: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasEndpoint: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const activeFilters = Object.entries(filterValues).filter(
    ([, v]) => v && v !== "All" && v !== "|",
  );

  return (
    <div className="space-y-4">
      {/* Preview header */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Report Preview
            </div>
            <h2 className="mt-1 text-xl font-semibold text-foreground">{report.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{report.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span>Generated: {new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <span>By: Admin User</span>
              <span>
                Total Records: <span className="font-semibold text-foreground">{isLoading ? "—" : totalRows}</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Excel
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
              <FileText className="h-4 w-4 text-rose-600" />
              PDF
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
              <Download className="h-4 w-4 text-sky-600" />
              CSV
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Save className="h-4 w-4" />
              Save Report
            </button>
          </div>
        </div>

        {/* Applied filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Applied Filters:
          </span>
          {activeFilters.length === 0 ? (
            <span className="text-xs text-muted-foreground">None</span>
          ) : (
            activeFilters.map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/20"
              >
                <span className="font-semibold">{k}:</span> {v.replace("|", " → ")}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search results…"
              className="h-9 w-72 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Settings2 className="h-3.5 w-3.5" />
              Column Settings
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Download className="h-3.5 w-3.5" />
              Export Current View
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Loading report…</span>
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertTriangle className="h-7 w-7 text-destructive/60" />
                      <span className="text-sm font-semibold text-foreground">Couldn’t load this report</span>
                      <span className="text-xs text-muted-foreground">
                        {error instanceof Error ? error.message : "Please try again."}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, columns.length)} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {hasEndpoint
                      ? "No data for the selected filters."
                      : "No data — this report has no connected data source yet."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    {columns.map((c) => (
                      <td key={c} className="px-4 py-2.5 text-foreground whitespace-nowrap">
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            Showing {rows.length} of {totalRows} records
          </span>
          <div className="flex items-center gap-2">
            <button className="rounded-md border border-border px-2 py-1 hover:bg-muted">Prev</button>
            <span>Page 1 of 1</span>
            <button className="rounded-md border border-border px-2 py-1 hover:bg-muted">Next</button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Columns
        </button>
      </div>
    </div>
  );
}

/* ---------------- Saved + History ---------------- */

function SavedReportsView({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <div className="text-sm font-semibold text-foreground">Saved Reports</div>
        <div className="text-xs text-muted-foreground">
          Reusable report configurations with filters and column layouts.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40">
            <tr>
              {["Saved Report Name", "Report Type", "Created By", "Last Generated", "Visibility", "Action"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAVED_REPORTS.map((r) => (
              <tr key={r.name} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-semibold text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-foreground">{r.type}</td>
                <td className="px-4 py-3 text-foreground">{r.by}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.last}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-border">
                    {r.visibility}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={onOpen}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      <Sparkles className="h-3 w-3" />
                      Generate
                    </button>
                    <button className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted">
                      <Settings2 className="h-3 w-3" />
                      Edit
                    </button>
                    <button className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-500/10">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExportHistoryView() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <div className="text-sm font-semibold text-foreground">Export History</div>
        <div className="text-xs text-muted-foreground">All previously generated and downloaded reports.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40">
            <tr>
              {["Report Name", "Generated By", "Generated Date", "File Type", "Records", "Action"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXPORT_HISTORY.map((r, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-semibold text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-foreground">{r.by}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-border">
                    {r.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground">{r.count.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">
                  <button className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted">
                    <Download className="h-3 w-3" />
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Save Dialog ---------------- */

function SaveReportDialog({ onClose, reportName }: { onClose: () => void; reportName: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-sm font-semibold text-foreground">Save Report</div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Report Name</label>
            <Input className="mt-1" defaultValue={`${reportName} — ${new Date().toLocaleDateString("en-GB")}`} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Description</label>
            <Input className="mt-1" placeholder="Short description (optional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" />
              Save Filters
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="checkbox" defaultChecked className="rounded" />
              Save Column Layout
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <input type="checkbox" className="rounded" />
              Share with Team
            </label>
            <Select defaultValue="Private">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Private">Private</SelectItem>
                <SelectItem value="Team">Team</SelectItem>
                <SelectItem value="Public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />
            Save Report
          </button>
        </div>
      </div>
    </div>
  );
}
