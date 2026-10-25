import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { COURSE_SAMPLE_LIMIT, type StudentRow } from "./use-dashboard-data";

const COLORS = [
  "var(--info)",
  "oklch(0.65 0.17 155)",
  "oklch(0.78 0.16 75)",
  "oklch(0.6 0.18 310)",
  "oklch(0.65 0.2 25)",
  "oklch(0.65 0.15 230)",
];
const MAX_COURSES = 6;
const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };

interface CourseRow {
  course: string;
  label: string;
  university: string;
  admissions: number;
}

function shortName(title: string): string {
  return title.length > 10 ? `${title.slice(0, 9)}…` : title;
}

function groupByCourse(students: readonly StudentRow[]): CourseRow[] {
  const map = new Map<string, CourseRow>();
  for (const s of students) {
    const label = s.course_title?.trim();
    if (!label) continue;
    const university = s.university_title?.trim() ?? "";
    const key = `${label}|${university}`;
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, admissions: prev.admissions + 1 } : { course: shortName(label), label, university, admissions: 1 });
  }
  return [...map.values()].sort((a, b) => b.admissions - a.admissions).slice(0, MAX_COURSES);
}

interface CoursePerformanceProps {
  students: readonly StudentRow[] | undefined;
  total: number;
  loading?: boolean;
}

export function CoursePerformance({ students, total, loading }: CoursePerformanceProps) {
  const data = useMemo(() => groupByCourse(students ?? []), [students]);
  const sum = data.reduce((a, b) => a + b.admissions, 0);
  const sampled = total > COURSE_SAMPLE_LIMIT;

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Course Performance</h3>
          <p className="text-xs text-muted-foreground">
            Your enrollments by course{sampled ? ` · latest ${COURSE_SAMPLE_LIMIT}` : ""}
          </p>
        </div>
      </div>
      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No enrollments yet.</p>
      ) : (
        <>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis dataKey="course" tickLine={false} axisLine={false} tick={AXIS_TICK} />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="admissions" name="Enrollments" radius={[8, 8, 0, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {data.slice(0, 3).map((c, i) => (
              <div key={`${c.label}-${c.university}`} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{c.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{c.university}</span>
                </span>
                <span className="text-sm font-semibold">{c.admissions}</span>
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {sum > 0 ? Math.round((c.admissions / sum) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
