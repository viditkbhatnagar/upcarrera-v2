import { toast } from "sonner";
import { ApplicantApiError } from "@/lib/applicant-api";

const LINK_DEAD_CODES = new Set([
  "LINK_INVALID",
  "LINK_EXPIRED",
  "LINK_REPLACED",
  "ALREADY_SUBMITTED",
  "SESSION_ENDED",
]);

/** Surface a save error as a toast, unless it is a dead-link (handled globally). */
export function handleSaveError(e: unknown): void {
  if (e instanceof ApplicantApiError) {
    if (e.code && LINK_DEAD_CODES.has(e.code)) return; // the route's listener takes over
    toast.error(e.message);
    return;
  }
  toast.error("Something went wrong. Please try again.");
}
