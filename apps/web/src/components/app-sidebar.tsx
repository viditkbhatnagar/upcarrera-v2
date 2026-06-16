import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  ClipboardList,
  Building2,
  Wallet,
  TrendingUp,
  Headphones,
  BarChart3,
  Settings,
  Sparkles,
  ChevronDown,
  FileText,
  Users,
  BookOpen,
  CalendarRange,
} from "lucide-react";

type SubItem = { to: string; label: string; icon: typeof LayoutDashboard };

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  children?: SubItem[];
};

const items: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    to: "/students",
    label: "Student Management",
    icon: GraduationCap,
    badge: "248",
    children: [
      { to: "/students/applications", label: "Applications", icon: FileText },
      { to: "/students/students", label: "Students", icon: Users },
    ],
  },
  { to: "/enrollment", label: "Enrollment Management", icon: ClipboardList, badge: "32" },
  {
    to: "/universities",
    label: "University Master",
    icon: Building2,
    children: [
      { to: "/universities/universities", label: "Universities", icon: Building2 },
      { to: "/universities/courses", label: "Courses", icon: BookOpen },
      { to: "/universities/intakes", label: "Intakes", icon: CalendarRange },
      { to: "/universities/fee-structure", label: "Fee Structure", icon: Wallet },
    ],
  },
  { to: "/fees", label: "Fee Management", icon: Wallet },
  { to: "/commissions", label: "Commission Management", icon: TrendingUp },
  { to: "/support", label: "Student Support", icon: Headphones, badge: "12" },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/administration", label: "Administration", icon: Settings },
];

interface AppSidebarProps {
  collapsed: boolean;
}

export function AppSidebar({ collapsed }: AppSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside
      className={[
        "hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-[72px] items-center" : "w-[260px]",
      ].join(" ")}
    >
      {/* Brand */}
      <div
        className={[
          "flex items-center gap-3 py-6",
          collapsed ? "px-3 justify-center" : "px-6",
        ].join(" ")}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-elevated">
          <Sparkles className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-tight">upCarrera Education</div>
            <div className="truncate text-[11px] text-sidebar-muted">Admission & Student Success</div>
          </div>
        )}
      </div>

      {!collapsed && <div className="mx-4 mb-2 h-px bg-white/10" />}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 w-full">
        {!collapsed && (
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
            Workspace
          </div>
        )}
        <ul className="space-y-1">
          {items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const isOpen = expanded[item.to] || active;
            const Icon = item.icon;
            const hasChildren = !!item.children && item.children.length > 0;

            return (
              <li key={item.to}>
                <div className="relative">
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" />
                  )}
                  <Link
                    to={item.to as any}
                    className={[
                      "group flex items-center gap-3 rounded-xl text-sm font-medium transition-all",
                      collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                      active
                        ? "bg-sidebar-active text-white"
                        : "text-sidebar-muted hover:bg-sidebar-hover hover:text-white",
                    ].join(" ")}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      className={[
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active ? "text-accent" : "text-sidebar-muted group-hover:text-white",
                      ].join(" ")}
                    />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "bg-white/10 text-sidebar-muted group-hover:bg-white/15 group-hover:text-white",
                        ].join(" ")}
                      >
                        {item.badge}
                      </span>
                    )}
                    {!collapsed && hasChildren && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleExpand(item.to);
                        }}
                        className="ml-auto grid h-5 w-5 place-items-center rounded-md hover:bg-white/10 transition"
                      >
                        <ChevronDown
                          className={[
                            "h-3.5 w-3.5 text-sidebar-muted transition-transform duration-200",
                            isOpen ? "rotate-180" : "",
                          ].join(" ")}
                        />
                      </button>
                    )}
                  </Link>
                </div>

                {/* Sub-items */}
                {!collapsed && hasChildren && isOpen && (
                  <ul className="mt-1 ml-6 space-y-1 border-l border-white/10 pl-3">
                    {item.children!.map((child) => {
                      const childActive = pathname === child.to;
                      const ChildIcon = child.icon;
                      return (
                        <li key={child.to}>
                          <Link
                            to={child.to as any}
                            className={[
                              "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all",
                              childActive
                                ? "bg-sidebar-active/60 text-white"
                                : "text-sidebar-muted hover:bg-sidebar-hover hover:text-white",
                            ].join(" ")}
                          >
                            <ChildIcon
                              className={[
                                "h-[16px] w-[16px] shrink-0 transition-colors",
                                childActive ? "text-accent" : "text-sidebar-muted group-hover:text-white",
                              ].join(" ")}
                            />
                            <span className="truncate">{child.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Help card */}
      {!collapsed && (
        <div className="m-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="text-xs font-semibold text-white">Need a hand?</div>
          <p className="mt-1 text-[11px] leading-relaxed text-sidebar-muted">
            Check the playbook or ping the ops team for workflow help.
          </p>
          <button className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover">
            Open Help Center
          </button>
        </div>
      )}
    </aside>
  );
}
