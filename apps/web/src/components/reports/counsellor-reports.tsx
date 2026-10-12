import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { downloadCsv, toCsv, type CsvColumn } from "@/components/applications/export-csv";
import { FileBarChart, Download, GraduationCap } from "lucide-react";

// One row per student (admission). Data is the SAME scoped /students endpoint the
// counsellor's "My Enrollments" uses — record-access limits it to their own
// students — so no extra backend scoping is needed. No incentive columns (ops: no
// incentives for now). Tags are not a concept in this CRM yet; when they are, add a
// tag filter + column here.
interface ApiStudentRow {
  id: number | string;
  name: string | null;
  enrollment_id: string | null;
  admission_status_label: string | null;
  course_title: string | null;
  university_title: string | null;
  enrollment_date: string | null;
}
interface StudentsResponse {
  items: ApiStudentRow[];
  total: number;
}

const EXPORT_COLUMNS: CsvColumn<ApiStudentRow>[] = [
  { header: "Name", value: (r) => r.name ?? "" },
  { header: "Enrollment ID", value: (r) => r.enrollment_id ?? "" },
  { header: "Course", value: (r) => r.course_title ?? "" },
  { header: "University", value: (r) => r.university_title ?? "" },
  { header: "Status", value: (r) => r.admission_status_label ?? "" },
  { header: "Enrolled on", value: (r) => (r.enrollment_date ?? "").slice(0, 10) },
];

export function CounsellorReports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["counsellor", "reports", "admissions"],
    queryFn: () => apiGet<StudentsResponse>("/students", { limit: 2000 }),
  });

  const all = data?.items ?? [];
  const rows = useMemo(() => {
    if (!from && !to) return all;
    return all.filter((r) => {
      const d = (r.enrollment_date ?? "").slice(0, 10);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [all, from, to]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const s = r.admission_status_label?.trim() || "Unspecified";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`my-admissions-${stamp}.csv`, toCsv(rows, EXPORT_COLUMNS));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Counsellor
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your admissions — one row per student. Filter by enrolment date and export.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Enrolled from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm font-normal text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Enrolled to
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm font-normal text-foreground"
          />
        </label>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total admissions
              </div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                {isLoading ? "…" : rows.length.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </div>
        {byStatus.slice(0, 3).map(([label, count]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
              {count.toLocaleString("en-IN")}
            </div>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FileBarChart className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">My admissions</div>
          <div className="ml-auto text-xs text-muted-foreground">{rows.length} row(s)</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Enrollment ID</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">University</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Enrolled on</th>
              </tr>
            </thead>
            <tbody>
              {isError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Couldn't load your admissions. Please refresh.
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No admissions in this range yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={String(r.id)} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.enrollment_id ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.course_title ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.university_title ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.admission_status_label ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {(r.enrollment_date ?? "").slice(0, 10) || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
