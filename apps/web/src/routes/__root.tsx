import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { AppShell } from "../components/app-shell";
import { Toaster } from "../components/ui/sonner";
import { getToken } from "../lib/session";

const PUBLIC_PATHS = new Set(["/", "/login"]);

/** Public (no-auth, no-AppShell) paths: the login/landing set, plus the applicant
 * form under /apply. The applicant form authenticates with its own session, never
 * the staff token, so it must bypass the staff token guard and the AppShell. */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname === "/apply" || pathname.startsWith("/apply/");
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again or head home.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Try again
          </button>
          <Link
            to="/login"
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Guard: every non-public route requires a token, else bounce to /login.
  beforeLoad: ({ location }) => {
    if (!isPublicPath(location.pathname) && !getToken()) {
      throw redirect({ to: "/login" });
    }
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const router = useRouter();
  const path = router.state.location.pathname;
  // The login/landing pages and the public applicant form render bare (no AppShell,
  // so no staff /auth/me calls or sidebar). Toaster stays mounted for both.
  const isLogin = path === "/login" || path === "/" || isPublicPath(path);

  // sonner renders nothing unless <Toaster /> is on the page. It had never been
  // mounted, so all 101 toast.success/toast.error calls across the app were
  // silent — every save confirmation and every server error went unseen. Mounted
  // at the root so it covers the login screen too.
  return (
    <>
      {isLogin ? (
        <Outlet />
      ) : (
        <AppShell>
          <Outlet />
        </AppShell>
      )}
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
