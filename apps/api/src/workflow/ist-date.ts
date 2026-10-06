/** India Standard Time is a fixed UTC+5:30 offset (no DST). */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST wall-clock Date for an instant (its UTC fields read as IST local time). */
function istShift(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

/** Today's date in IST as a YYYY-MM-DD string. */
export function istTodayIso(now: Date = new Date()): string {
  return istShift(now).toISOString().slice(0, 10);
}

/** The calendar year in IST (used for STU-YYYY-NNNNNN). */
export function istYear(now: Date = new Date()): number {
  return istShift(now).getUTCFullYear();
}

/** The YYYY-MM-DD part of a date or ISO string, for a date-only comparison. */
export function dateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}
