import { redirect } from "next/navigation";

/**
 * Root route. Auth is handled by `middleware.ts` (no token -> /login). When a token
 * IS present, send the user straight to their dashboard.
 */
export default function RootPage() {
  redirect("/dashboard");
}
