import type { ReactNode } from "react";
import { useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} />
      <div className={collapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"}>
        <AppHeader collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
