/**
 * A teacher row. A teacher is a `users` row with role_id=3, so field names mirror
 * the `users` Prisma model exactly (apps/api/prisma/schema.prisma). Password and
 * zoom credentials are stripped server-side and never surfaced here.
 */
export interface Teacher {
  id: number;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  code: number | null;
  gender: string | null;
  region: string | null;
  highest_qualification: string | null;
  languages_spoken: string | null;
  profile_picture: string | null;
  zoom_id: string | null;
  zoom_email: string | null;
  meeting_link: string | null;
  status: number | null;
  created_at: string | null;
  [key: string]: unknown;
}

/** `users.status` is an integer flag; 1 means the account is active. */
export const STATUS_ACTIVE = 1;
