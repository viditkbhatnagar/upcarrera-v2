/**
 * Shared API/domain types for the staff console.
 * The NestJS API wraps every response in the legacy envelope `{ status, message, data }`.
 */

/** The envelope every API response is wrapped in. */
export interface ApiEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

/** Shape of a paginated list endpoint's `data` payload. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** The user snapshot returned by /auth/login (plus the JWT). */
export interface AuthUser {
  id: number;
  role_id: number | null;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  profile_picture: string | null;
}

export interface LoginResult extends AuthUser {
  auth_token: string;
}

/** A CRM lead row (subset of fields the UI uses). */
export interface Lead {
  id: number;
  title: string | null;
  phone: string | null;
  email: string | null;
  lead_status_id: number | null;
  created_at: string | null;
  [key: string]: unknown;
}

/** A student profile row (subset of fields the UI uses). */
export interface Student {
  id: number;
  student_id: number;
  course_id: number | null;
  admission_status: number | null;
  [key: string]: unknown;
}
