import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FileText, BarChart3, BookOpen, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { COUNSELLOR_NAV, isActivePath } from "./nav";

const PRIMARY = [
  { title: "Applications", to: "/students/applications", icon: FileText },
  { title: "Performance", to: "/counsellors/targets", icon: BarChart3 },
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard, center: true },
  { title: "Courses", to: "/universities/courses", icon: BookOpen },
];
const PRIMARY_PATHS = new Set(PRIMARY.map((p) => p.to));
const MORE = COUNSELLOR_NAV.filter((n) => !PRIMARY_PATHS.has(n.to));

export function CounsellorMobileNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((m) => isActivePath(path, m.to));

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-sidebar border-t border-sidebar-border pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <ul className="grid grid-cols-5 items-end">
          {PRIMARY.map((item) => {
            const active = isActivePath(path, item.to);
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex justify-center">
                <Link
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 px-1 w-full text-[10px] font-medium",
                    active ? "text-sidebar-primary" : "text-sidebar-foreground",
                  )}
                >
                  {item.center ? (
                    <span
                      className={cn(
                        "-mt-6 grid h-14 w-14 place-items-center rounded-full shadow-lg ring-4 ring-sidebar",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                  <span className="truncate max-w-full">{item.title}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-1 w-full text-[10px] font-medium",
                moreActive ? "text-sidebar-primary" : "text-sidebar-foreground",
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Other</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="bg-sidebar text-sidebar-foreground border-sidebar-border rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle className="text-sidebar-accent-foreground">More</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 p-4 pt-4">
            {MORE.map((item) => {
              const active = isActivePath(path, item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-xl p-4 text-xs font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-center leading-tight">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
