// Form model for the Students list's Edit dialog (QA ST04).
//
// Same discipline as the university/course/intake/application editors: the form
// is SEEDED FROM THE RAW SERVER ROW (GET /students/:id, never the display row),
// and the request body carries ONLY the fields the operator changed. A display
// value ("—", a resolved title, "STU-1688") can therefore never be written back
// over real data.

import type { ApiStudentDetail } from "./profile-types";

/** Every value is a string so it binds straight to an Input/Select. Ids as strings; "" = none. */
export interface StudentForm {
  admission_status: string;
  enrollment_id: string;
  enrollment_date: string;
  course_id: string;
  specialisation_id: string;
  session_id: string;
  consultant_id: string;
  mode: string;
  source: string;
  whatsapp_no: string;
  second_phone: string;
  abc_id: string;
  address: string;
  district: string;
  state: string;
}

export type StudentFormKey = keyof StudentForm;
export type StudentFormErrors = Partial<Record<StudentFormKey, string>>;

/** The raw columns the editor reads (GET /students/:id returns every students column). */
export type RawStudent = ApiStudentDetail & {
  second_phone: string | null;
  address: string | null;
  district: string | null;
  state: string | null;
};

const INT_FIELDS = new Set<StudentFormKey>([
  "admission_status",
  "course_id",
  "specialisation_id",
  "session_id",
  "consultant_id",
]);
const DATE_FIELDS = new Set<StudentFormKey>(["enrollment_date"]);
/** NOT NULL text columns: an emptied field is saved as "", never null. */
const NOT_NULL_TEXT = new Set<StudentFormKey>(["address"]);

const MAX_LENGTH: Partial<Record<StudentFormKey, number>> = {
  enrollment_id: 50,
  mode: 50,
  source: 50,
  whatsapp_no: 25,
  second_phone: 20,
  abc_id: 200,
  district: 100,
  state: 60,
};

/** Mirrors the API's shape check: digits with optional +, spaces, dashes, brackets. */
const PHONE_SHAPE = /^\+?[\d\s\-()]{6,24}$/;

const str = (v: string | number | null | undefined): string => (v == null ? "" : String(v));

/** A DATE column arrives as an ISO timestamp; the date input wants YYYY-MM-DD. */
function dateOnly(v: string | null | undefined): string {
  if (!v) return "";
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
}

export function seedFromRaw(raw: RawStudent): StudentForm {
  return {
    admission_status: str(raw.admission_status),
    enrollment_id: str(raw.enrollment_id),
    enrollment_date: dateOnly(raw.enrollment_date),
    course_id: str(raw.course_id),
    specialisation_id: str(raw.specialisation_id),
    session_id: str(raw.session_id),
    consultant_id: str(raw.consultant_id),
    mode: str(raw.mode),
    source: str(raw.source),
    whatsapp_no: str(raw.whatsapp_no),
    second_phone: str(raw.second_phone),
    abc_id: str(raw.abc_id),
    address: str(raw.address),
    district: str(raw.district),
    state: str(raw.state),
  };
}

function toBodyValue(key: StudentFormKey, value: string): string | number | null {
  const v = value.trim();
  if (INT_FIELDS.has(key)) return v === "" ? null : Number(v);
  if (DATE_FIELDS.has(key)) return v === "" ? null : v;
  if (NOT_NULL_TEXT.has(key)) return v;
  return v === "" ? null : v;
}

/** The PATCH /students/:id body: only fields whose value differs from the seed. */
export function changedFields(
  form: StudentForm,
  seed: StudentForm,
): Partial<Record<StudentFormKey, string | number | null>> {
  const body: Partial<Record<StudentFormKey, string | number | null>> = {};
  for (const key of Object.keys(form) as StudentFormKey[]) {
    if (form[key].trim() !== seed[key].trim()) body[key] = toBodyValue(key, form[key]);
  }
  return body;
}

export function validateStudentForm(form: StudentForm, seed: StudentForm): StudentFormErrors {
  const errors: StudentFormErrors = {};
  if (!form.consultant_id) errors.consultant_id = "A counsellor is required.";
  if (seed.admission_status !== "" && form.admission_status === "") {
    errors.admission_status = "Choose a status.";
  }
  for (const key of ["whatsapp_no", "second_phone"] as const) {
    const v = form[key].trim();
    // Only a changed value is checked: a legacy value nobody touched is not ours to reject.
    if (v && v !== seed[key].trim() && !PHONE_SHAPE.test(v)) {
      errors[key] = "Enter a phone number (digits, +, spaces or dashes).";
    }
  }
  for (const [key, max] of Object.entries(MAX_LENGTH) as Array<[StudentFormKey, number]>) {
    if (form[key].trim().length > max) errors[key] = `At most ${max} characters.`;
  }
  return errors;
}
