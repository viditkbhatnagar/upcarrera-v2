# Fee Structure master (WS2, spec FS01–FS04)

Owns the Draft → Active → Expired lifecycle for one master per
(university × course × intake), the Rs0 activation guard, copy / bulk-copy,
stage-4 resolve, and CSV export. All money math goes through the pure helpers in
`fee-structure.money.ts` / `fee-structure.compute.ts` so totals never drift.

## Intake ordering note

Copy-to-next-intake and the intake status badge order intakes by `start_date`
when present, else by `(year, month)`, else by `id` (see `pickNextIntakeId` /
`deriveIntakeStatus`). **Production intake `start_date`s should be populated for
the best ordering** — the `(year, month)` and `id` fallbacks are only a
best-effort substitute when dates are missing. This is a data note, not a code
TODO: no migration or seed ships here.

## Period context (per-year / per-semester fees)

Per-year / per-semester exam and "other" fees expand over the course's real
duration (parsed from `course.duration` / `course.total_duration`, or an explicit
`course_fee_periods`), independent of the course-fee basis. A per-period fee with
no resolvable period count is rejected at save (422) rather than charged once.
