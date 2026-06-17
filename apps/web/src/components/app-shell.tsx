import type { ReactNode } from "react";
import { useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      {/* Mobile backdrop — tap to close the drawer */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        />
      )}

      <div className={collapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"}>
        <AppHeader
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onMobileMenu={() => setMobileOpen(true)}
        />
        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {/* Cap + centre content on ultra-wide screens (TV/4K) so cards and
              tables stay readable; no effect at or below ~1920px. */}
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
