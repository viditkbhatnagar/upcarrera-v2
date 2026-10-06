import type { ApplicationView, Lookups } from "@/lib/applicant-api";

export interface SectionProps {
  app: ApplicationView;
  lookups: Lookups;
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** Refetch the application (new row_version, progress, eligibility). */
  reload: () => Promise<void>;
  /** Advance to the next step. */
  goNext: () => void;
}

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export type { ApplicationView, Lookups };
