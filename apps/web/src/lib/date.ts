// Date helpers for values the server validates in India Standard Time.

/**
 * Today's date as an ISO `YYYY-MM-DD` string in India Standard Time (Asia/Kolkata).
 *
 * The admissions API validates `paid_on` and the hold `followup_date` against the
 * IST calendar day (see apps/api workflow `istTodayIso`). Using `toISOString()`
 * (UTC) instead would, between 00:00 and 05:30 IST, yield YESTERDAY's date — so a
 * paid-on `max` / follow-up `min` or default built from UTC lands a day behind the
 * server and the request is rejected. `en-CA` formats as `YYYY-MM-DD`.
 */
export function istTodayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
