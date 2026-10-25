import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { useAccess } from "@/components/applications/use-access";
import { CounsellorShell } from "@/components/counsellor/counsellor-shell";
import { getUser } from "@/lib/session";

const COUNSELLOR_ROLE_ID = 6;

// Paths a counsellor may open; anything else bounces to their dashboard. The
// server still enforces permissions on every API — this is UX + defence-in-depth
// so a counsellor can't land on an admin screen shell by typing a URL.
const COUNSELLOR_ALLOWED = [
  "/dashboard",
  "/students",
  "/counsellors/targets",
  "/universities/courses",
  "/reports",
  "/settings",
  // Coming-soon placeholders (backends land in later phases).
  "/payments",
  "/training",
  "/resources",
];
function pathAllowedForCounsellor(pathname: string): boolean {
  return COUNSELLOR_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false); // desktop collapse
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer

  const access = useAccess();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  // While /auth/me/access is in flight, fall back to the cached session role so a
  // counsellor never sees a flash of the admin shell (role_id 6 = counsellor).
  const isCounsellor = access.isLoading
    ? getUser()?.role_id === COUNSELLOR_ROLE_ID
    : access.data?.role_key === "counsellor";
  const blocked = isCounsellor && !pathAllowedForCounsellor(pathname);

  useEffect(() => {
    if (blocked) navigate({ to: "/dashboard" });
  }, [blocked, navigate]);

  if (isCounsellor) {
    return <CounsellorShell>{blocked ? null : children}</CounsellorShell>;
  }

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
          <div className="mx-auto w-full max-w-[1800px]">{blocked ? null : children}</div>
        </main>
      </div>
    </div>
  );
}
