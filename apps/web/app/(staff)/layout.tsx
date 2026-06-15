import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

/**
 * Staff shell: fixed Sidebar + Topbar + scrollable content area.
 * Auth is enforced by `middleware.ts` before this layout ever renders.
 */
export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas bg-grid">
      <Sidebar />
      <div className="pl-64">
        <Topbar />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
