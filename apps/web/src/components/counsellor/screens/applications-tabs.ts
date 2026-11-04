import type { Stage } from "@/lib/api/applications";

/**
 * DISPLAY-LAYER ONLY: Sharon's counsellor tab labels -> backend workflow stages.
 * The backend state machine is unchanged; edit this table to regroup the tabs.
 * Order here is the on-screen tab order ("All" is appended by the screen).
 */
export const TABS: readonly { label: string; stages: readonly Stage[] }[] = [
  { label: "Lead", stages: ["lead_added"] },
  { label: "Payment Pending", stages: ["fee_pending"] },
  { label: "Paid", stages: ["fee_verification"] },
  { label: "Form Pending", stages: ["form_pending"] },
  { label: "Approval Waiting", stages: ["counsellor_review", "sa_verification"] },
  { label: "Enrolled", stages: ["converted"] },
  { label: "Rejected", stages: ["rejected"] },
];

export const TAB_ALL = "All";

/** Backend stages a tab covers, or undefined for "All". */
export function tabStages(label: string): readonly Stage[] | undefined {
  return TABS.find((t) => t.label === label)?.stages;
}

/** Tab count = sum of its mapped backend stage counts. */
export function tabCount(
  label: string,
  counts: Partial<Record<Stage, number>> | undefined,
): number | undefined {
  const stages = tabStages(label);
  if (!counts || !stages) return undefined;
  return stages.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
}
