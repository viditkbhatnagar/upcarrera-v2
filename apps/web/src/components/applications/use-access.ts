// GET /auth/me/access — the caller's record-access summary. Cosmetic only (the
// server enforces access on every route); it lets the sidebar hide items a role
// cannot use and the list hide owner filters a single-owner counsellor never needs.
import { useQuery } from "@tanstack/react-query";
import { getMyAccess, type MeAccess } from "@/lib/api/applications";

const ACCESS_STALE_MS = 5 * 60 * 1000;

export function useAccess() {
  const query = useQuery({
    queryKey: ["auth", "me", "access"],
    queryFn: getMyAccess,
    staleTime: ACCESS_STALE_MS,
  });
  return query;
}

/**
 * Whether the caller can own more than one counsellor's rows — i.e. the list
 * should offer counsellor / team / group filters. A plain counsellor (scope
 * "owners" with a single id) only ever sees their own, so the filters are hidden.
 */
export function canFilterByOwner(access: MeAccess | undefined): boolean {
  if (!access) return false;
  if (access.scope === "all" || access.scope === "stages") return true;
  if (access.scope === "owners") return (access.owner_ids_count ?? 0) > 1;
  return false;
}

export type { MeAccess };
