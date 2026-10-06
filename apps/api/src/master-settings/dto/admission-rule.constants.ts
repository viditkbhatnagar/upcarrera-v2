/**
 * Qualification ladder for course_admission_rule.min_qualification. Matches
 * qualification.level_code and EligibilityService.LEVEL_LADDER (low -> high), the
 * single source of truth the public eligibility check ranks against.
 */
export const MIN_QUALIFICATION_LEVELS = [
  '10th',
  '12th',
  'diploma',
  'ug',
  'pg',
  'doctorate',
] as const;

export type MinQualificationLevel = (typeof MIN_QUALIFICATION_LEVELS)[number];

/** Percentage minimum bounds (decimal(5,2); a percentage is 0-100). */
export const MIN_PERCENTAGE_FLOOR = 0;
export const MIN_PERCENTAGE_CEILING = 100;

/** CGPA minimum bounds (decimal(4,2); a CGPA is on a 0-10 scale). */
export const MIN_CGPA_FLOOR = 0;
export const MIN_CGPA_CEILING = 10;

/** Experience bound (smallint months), matching the public Employment section cap. */
export const MIN_EXPERIENCE_MONTHS_CEILING = 900;
