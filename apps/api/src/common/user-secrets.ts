/**
 * The single list of `users` columns that must never leave the API.
 *
 * This used to be six private copies — one per service that returns user rows —
 * and they had drifted: platform stripped only `password`, clients missed
 * `zoom_password`, and every module except consultants returned `otp`. So
 * GET /users handed any signed-in caller every user's live one-time login code,
 * Zoom password and previous password hash.
 *
 * Every service that returns a users row must go through `stripUserSecrets`.
 * If a credential column is ever added to `users`, add it HERE — once — and
 * every endpoint is covered. test/user-secrets.e2e-spec.ts plants a value in
 * each of these columns and asserts no user-returning endpoint echoes it.
 */
export const USER_SECRET_FIELDS = [
  /** bcrypt hash of the current password. */
  'password',
  /** bcrypt hash of the previous password, kept by the admin reset flow. */
  'prev_password',
  /** The live one-time login code. */
  'otp',
  /** The user's Zoom account password. */
  'zoom_password',
] as const;

export type UserSecretField = (typeof USER_SECRET_FIELDS)[number];

const SECRET_SET: ReadonlySet<string> = new Set(USER_SECRET_FIELDS);

/**
 * Return a copy of `user` with every credential column removed.
 *
 * Builds a new object rather than deleting keys, so the caller's row is never
 * mutated. Accepts any object, so rows from `select`, decorated rows and raw
 * Prisma rows all work.
 */
export function stripUserSecrets<T extends object>(user: T): Omit<T, UserSecretField> {
  return Object.fromEntries(
    Object.entries(user).filter(([key]) => !SECRET_SET.has(key)),
  ) as Omit<T, UserSecretField>;
}
