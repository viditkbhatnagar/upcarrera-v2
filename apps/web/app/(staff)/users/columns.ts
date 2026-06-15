/**
 * A user (staff/student identity) row.
 * Field names mirror the `users` Prisma model exactly (apps/api/prisma/schema.prisma).
 */
export interface User {
  id: number;
  name: string | null;
  username: string | null;
  email: string | null;
  role_id: number | null;
  status: number | null;
  [key: string]: unknown;
}

/** `users.status` is an integer flag; 1 means the account is active. */
export const STATUS_ACTIVE = 1;
