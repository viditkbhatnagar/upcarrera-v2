/**
 * Shared vocabularies for the document-checklist master settings.
 *
 * `course_level` is the CANONICAL course-level vocabulary (migration 002 — the
 * same set `canonicalCourseLevel(course.level)` maps onto, see
 * src/workflow/stages.ts). The SA approve gate and the public document checklist
 * both resolve `document_requirement` rows by this canonical value, so the admin
 * surface MUST store the canonical value — never the raw free-text course.level.
 */
export const CANONICAL_COURSE_LEVELS = [
  'certification',
  'diploma',
  'ug',
  'pg',
  'doctorate',
] as const;

export type CanonicalCourseLevel = (typeof CANONICAL_COURSE_LEVELS)[number];

/**
 * `applies_when` (migration 002): NULL = the requirement always applies;
 * 'employment' = only when the course requires the Employment section
 * (course_admission_rule.requires_employment). The UI sentinel 'always' and an
 * empty string both normalise to NULL.
 */
export const APPLIES_WHEN_VALUES = ['employment'] as const;
export type AppliesWhen = (typeof APPLIES_WHEN_VALUES)[number];

/** Smallint ceiling for max_files — a sane upper bound for a single checklist row. */
export const MAX_FILES_CEILING = 20;

/**
 * Normalise the DTO `applies_when` to the stored value: '', 'always' (and
 * undefined) -> null; 'employment' -> 'employment'. The DTO's @IsIn already
 * rejects any other non-empty value.
 */
export function normaliseAppliesWhen(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'always') return null;
  return v;
}
