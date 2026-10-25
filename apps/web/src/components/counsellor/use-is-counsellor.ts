import { useAccess } from "@/components/applications/use-access";
import { getUser } from "@/lib/session";

const COUNSELLOR_ROLE_ID = 6;

/**
 * Whether the signed-in user is a counsellor. While /auth/me/access is in flight
 * it falls back to the cached session role, so a counsellor never flashes an
 * admin screen (same rule as the app shell).
 */
export function useIsCounsellor(): boolean {
  const access = useAccess();
  return access.isLoading
    ? getUser()?.role_id === COUNSELLOR_ROLE_ID
    : access.data?.role_key === "counsellor";
}
