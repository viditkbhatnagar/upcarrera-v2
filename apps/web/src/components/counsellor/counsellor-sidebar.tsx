import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { GanttChart, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { COUNSELLOR_NAV, isActivePath } from "./nav";
import { useConsultantMetrics } from "./use-consultant-metrics";

export function CounsellorSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const metrics = useConsultantMetrics();
  const pct = Math.max(0, Math.min(100, Math.round(metrics.data?.achievement_percentage ?? 0)));

  return (
    <>
      <aside
        className={cn(
          "hidden lg:flex lg:fixed lg:left-0 lg:top-0 lg:h-screen shrink-0 flex-col border-r border-border bg-sidebar z-50 transition-all duration-300",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <GanttChart className="h-5 w-5" />
          </div>
          <div className={cn("overflow-hidden transition-all duration-300", collapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
            <p className="text-sm font-semibold leading-tight whitespace-nowrap text-sidebar-accent-foreground">upCarrera</p>
            <p className="text-[10px] text-sidebar-foreground/70 leading-tight whitespace-nowrap">Learn. Grow. Succeed</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "ml-auto h-7 w-7 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "hidden",
            )}
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto" aria-label="Counsellor navigation">
          {COUNSELLOR_NAV.map((item) => {
            const active = isActivePath(path, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-2",
                )}
                title={collapsed ? item.title : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className={cn("whitespace-nowrap", collapsed && "hidden")}>{item.title}</span>
              </Link>
            );
          })}
        </nav>

        <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-4")}>
          {collapsed ? (
            <Button
              variant="ghost"
              size="icon"
              className="w-full h-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="rounded-lg p-3 bg-primary text-primary-foreground">
              <p className="text-xs font-medium opacity-90">Monthly Goal</p>
              <p className="text-lg font-bold">{metrics.data ? `${pct}% Complete` : "—"}</p>
              <div className="mt-2 h-1.5 rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      </aside>
      <div
        className={cn("hidden lg:block shrink-0 transition-all duration-300", collapsed ? "w-16" : "w-64")}
        aria-hidden="true"
      />
    </>
  );
}
