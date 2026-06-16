import { Search, Bell, ChevronDown, CheckCircle2, CalendarClock, PanelLeft } from "lucide-react";

interface AppHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppHeader({ collapsed, onToggle }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          onClick={onToggle}
          className="hidden lg:grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-foreground transition hover:bg-muted"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>

        <div className="hidden sm:flex flex-1 max-w-xl relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search students, enrollments, universities…"
            className="w-full rounded-xl border border-border bg-muted/60 py-2.5 pl-10 pr-16 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:bg-surface transition"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        <div className="flex-1 sm:hidden" />

        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-foreground transition hover:bg-muted">
          <CalendarClock className="h-[18px] w-[18px]" />
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            5
          </span>
        </button>

        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-foreground transition hover:bg-muted">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
            9
          </span>
        </button>

        <div className="mx-1 hidden sm:block h-8 w-px bg-border" />

        <button className="flex items-center gap-3 rounded-xl border border-transparent px-1.5 py-1 transition hover:bg-muted hover:border-border">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            PS
          </div>
          <div className="hidden md:block text-left leading-tight">
            <div className="text-sm font-semibold text-foreground">Welcome back, Priya</div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-success" />
              Student Support Executive
            </div>
          </div>
          <ChevronDown className="hidden md:block h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
