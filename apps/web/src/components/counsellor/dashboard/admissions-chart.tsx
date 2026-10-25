import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import type { ConsultantMetrics } from "../use-consultant-metrics";

const ENROLLMENT_COLOR = "oklch(0.65 0.17 155)";
const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" };

interface AdmissionsChartProps {
  trends: ConsultantMetrics["trends"] | undefined;
  year: number | undefined;
  loading?: boolean;
}

export function AdmissionsChart({ trends, year, loading }: AdmissionsChartProps) {
  const data = useMemo(
    () =>
      (trends?.months ?? []).map((m, i) => ({
        m,
        enrollments: trends?.admissions[i] ?? 0,
        points: trends?.achieved_points[i] ?? 0,
      })),
    [trends],
  );
  const ytd = data.reduce((sum, d) => sum + d.enrollments, 0);

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Admissions Analytics</h3>
          <p className="text-xs text-muted-foreground">Enrollments and points achieved by month{year ? ` · ${year}` : ""}</p>
        </div>
        <div className="flex items-center gap-4">
          <Legend color={ENROLLMENT_COLOR} label="Enrollments" />
          <Legend color="var(--info)" label="Points achieved" />
          <div className="rounded-lg bg-success-soft text-success px-3 py-1.5 text-xs font-semibold">
            {ytd.toLocaleString("en-IN")} enrolled YTD
          </div>
        </div>
      </div>
      <div className="mt-6 h-72">
        {loading ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--info)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--info)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ENROLLMENT_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ENROLLMENT_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={AXIS_TICK} />
              <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={AXIS_TICK} hide />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
              />
              <Area yAxisId="right" name="Points achieved" type="monotone" dataKey="points" stroke="var(--info)" strokeWidth={2.5} fill="url(#g1)" />
              <Area yAxisId="left" name="Enrollments" type="monotone" dataKey="enrollments" stroke={ENROLLMENT_COLOR} strokeWidth={2.5} fill="url(#g2)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}
