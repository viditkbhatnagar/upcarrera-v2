import { useEffect, type ReactNode } from "react";
import { CounsellorSidebar } from "./counsellor-sidebar";
import { CounsellorTopbar } from "./counsellor-topbar";
import { CounsellorMobileNav } from "./mobile-bottom-nav";
import { THEME_KEY } from "./theme-toggle";

const PORTAL_CLASS = "counsellor-portal";

/**
 * Counsellor portal shell (Naji's design). The theme class goes on <html> rather
 * than a wrapper so Radix portals (popovers, sheets, dialogs) pick up the same
 * tokens. It is removed on unmount, leaving the admin theme untouched.
 */
export function CounsellorShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(PORTAL_CLASS);
    try {
      if (localStorage.getItem(THEME_KEY) === "dark") root.classList.add("dark");
    } catch {
      // storage unavailable: stay on the light theme
    }
    return () => {
      root.classList.remove(PORTAL_CLASS, "dark");
    };
  }, []);

  return (
    <div className="min-h-screen flex w-full bg-background pb-20 lg:pb-0">
      <CounsellorSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <CounsellorTopbar />
        <main className="flex-1 p-4 lg:p-8 space-y-6">{children}</main>
      </div>
      <CounsellorMobileNav />
    </div>
  );
}
