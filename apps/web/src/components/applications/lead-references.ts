// Source -> reference rules for the Add / Edit Lead form.
//
// "Student Reference" stores the referring student's USER id in
// applications.referred_by; "External Reference" stores an external_referee id
// in applications.external_referee_id. The two are mutually exclusive.

export const STUDENT_REFERENCE_SOURCE = "Student Reference";
export const EXTERNAL_REFERENCE_SOURCE = "External Reference";

export interface ExternalRefereeInput {
  name: string;
  email: string;
  phone: string;
  state: string;
  district: string;
}

/** A referee as GET /external-referees returns it. */
export interface ExternalReferee extends ExternalRefereeInput {
  id: number;
}

const MIN_PHONE_DIGITS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function needsReference(source: string): boolean {
  return source === STUDENT_REFERENCE_SOURCE || source === EXTERNAL_REFERENCE_SOURCE;
}

export function matchesReference(query: string, values: string[]): boolean {
  const term = query.trim().toLowerCase();
  return values.some((value) => value.toLowerCase().includes(term));
}

/** Field errors for a new external referee; an empty object means valid. */
export function validateReferee(values: ExternalRefereeInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ["name", "email", "phone", "state", "district"] as const) {
    if (!values[key].trim()) errors[key] = "This field is required";
  }
  if (values.email && !EMAIL_RE.test(values.email.trim())) {
    errors.email = "Enter a valid email address";
  }
  if (values.phone && values.phone.replace(/\D/g, "").length < MIN_PHONE_DIGITS) {
    errors.phone = "Enter a valid contact number";
  }
  return errors;
}
