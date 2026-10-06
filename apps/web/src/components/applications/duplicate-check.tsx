// Mobile validation + duplicate-lead lookup for the application forms (QA AP10).
//
// The server is the authority — POST /applications rejects a malformed mobile
// with 400 and a second application for the same mobile/email with 409 — but
// checking here lets the counsellor see the existing application and its
// counsellor before typing the rest of the form (spec 4.2).

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Pause before a typed mobile/email is looked up. */
const DUPLICATE_DEBOUNCE_MS = 500;

export const INDIAN_MOBILE_ERROR = "Enter a valid 10-digit Indian mobile number";

/**
 * Canonical 10-digit form of an Indian mobile, or null. Mirrors the API's
 * normalizeIndianMobile (apps/api/src/students/indian-mobile.ts): strips spaces,
 * dashes, dots and brackets, then a +91 / 91 / 0 prefix.
 */
export function normalizeIndianMobile(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) {
    if (!digits.startsWith("+91")) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return INDIAN_MOBILE.test(digits) ? digits : null;
}

export function isValidEmail(raw: string): boolean {
  return EMAIL.test(raw.trim());
}

export interface DuplicateMatch {
  application_id: number;
  display_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  matched_on: Array<"phone" | "email">;
  consultant_name: string | null;
  course_title: string | null;
  university_title: string | null;
  status_label: string | null;
}

interface DuplicateResponse {
  duplicate: boolean;
  matches: DuplicateMatch[];
}

/**
 * Looks up existing applications for a mobile and/or email once they are valid
 * and the user has paused typing. `excludeId` is the application being edited.
 */
export function useDuplicateCheck(phone: string, email: string, excludeId?: number) {
  const canonicalPhone = normalizeIndianMobile(phone);
  const validEmail = isValidEmail(email) ? email.trim() : null;
  // Debounce a primitive: a fresh object every render would never settle.
  const liveKey = `${canonicalPhone ?? ""}|${validEmail ?? ""}`;
  const settledKey = useDebouncedValue(liveKey, DUPLICATE_DEBOUNCE_MS);
  const [settledPhone, settledEmail] = settledKey.split("|");
  const enabled = settledPhone !== "" || settledEmail !== "";

  const query = useQuery({
    queryKey: ["applications", "check-duplicate", settledPhone, settledEmail, excludeId ?? null],
    queryFn: () =>
      apiGet<DuplicateResponse>("/applications/check-duplicate", {
        phone: settledPhone || undefined,
        email: settledEmail || undefined,
        exclude_id: excludeId,
      }),
    enabled,
    staleTime: 30 * 1000,
  });

  // A result only counts for the values currently in the form.
  const current = settledKey === liveKey;
  const matches = enabled && current ? (query.data?.matches ?? []) : [];
  return {
    matches,
    checking: enabled && (query.isFetching || !current),
    failed: query.isError,
  };
}

/** Inline panel naming the existing application(s) a new lead would duplicate. */
export function DuplicateNotice({
  matches,
  onShow,
}: {
  matches: DuplicateMatch[];
  onShow?: (displayId: string) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        This applicant already has an application
      </div>
      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li key={m.application_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-mono font-semibold">{m.display_id}</span>
            <span>{m.name ?? "Unnamed"}</span>
            <span className="text-amber-800/80 dark:text-amber-200/80">
              · Counsellor: {m.consultant_name ?? "not assigned"}
              {m.course_title ? ` · ${m.course_title}` : ""}
              {` · matched on ${m.matched_on.map((x) => (x === "phone" ? "mobile" : "email")).join(" & ")}`}
            </span>
            {onShow && (
              <button
                type="button"
                onClick={() => onShow(m.display_id)}
                className="font-semibold underline underline-offset-2 hover:no-underline"
              >
                Show in list
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small "checking…" hint shown under the contact fields while a lookup runs. */
export function DuplicateChecking({ checking }: { checking: boolean }) {
  if (!checking) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Checking for an existing application…
    </p>
  );
}
