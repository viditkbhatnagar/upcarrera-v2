import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { FileText, Users, Target, TrendingUp, ArrowRight, Award } from "lucide-react";

interface ConsultantMetrics {
  year: number;
  target_point: number;
  achieved_points: number;
  achievement_percentage: number;
  admissions_count: number;
}

const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");

export function CounsellorDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "consultant"],
    queryFn: () => apiGet<ConsultantMetrics>("/dashboard/consultant"),
  });

  const d = data;
  const pct = Math.max(0, Math.min(100, Math.round(d?.achievement_percentage ?? 0)));
  const barTone = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";

  const cards = [
    { label: "Admissions this month", value: nf(d?.admissions_count), icon: Users, tint: "primary" as const },
    { label: "Points achieved (month)", value: nf(d?.achieved_points), icon: Award, tint: "accent" as const },
    { label: "Points target", value: nf(d?.target_point), icon: Target, tint: "primary" as const },
    { label: "Achievement", value: `${pct}%`, icon: TrendingUp, tint: "accent" as const },
  ];

  const links = [
    { to: "/students/applications", label: "Applications", icon: FileText, desc: "Work your leads through the pipeline" },
    { to: "/students/students", label: "My Enrollments", icon: Users, desc: "Students you've enrolled" },
    { to: "/counsellors/targets", label: "Performance", icon: Target, desc: "Your targets and achievement" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Counsellor
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          My Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your performance this month{d ? ` · ${d.year}` : ""}.
        </p>
      </header>

      {isError ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          Couldn't load your dashboard. Please refresh.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <span
                      className={[
                        "grid h-11 w-11 place-items-center rounded-xl",
                        c.tint === "primary" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent",
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {c.label}
                      </div>
                      <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                        {isLoading ? "…" : c.value}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Achievement progress */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">Target achievement</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">{pct}%</div>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={["h-full rounded-full transition-all", barTone].join(" ")} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {nf(d?.achieved_points)} of {nf(d?.target_point)} points this month.
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:border-primary/40 hover:shadow-md"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{l.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.desc}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
