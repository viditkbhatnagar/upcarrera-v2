// Client-side zod schemas mirroring the apps/api public section DTOs — the single
// source of client validation messages. The server re-validates everything
// (forbidNonWhitelisted), so these are UX only, not a security boundary.
import { z } from "zod";

export const CATEGORIES = ["general", "obc", "sc", "st", "ews", "other"] as const;
export const MARITAL_STATUSES = ["single", "married", "other"] as const;
export const QUALIFICATION_LEVELS = ["10th", "12th", "diploma", "ug", "pg", "doctorate"] as const;
export const SCORE_TYPES = ["percentage", "cgpa", "grade"] as const;
export const EMPLOYMENT_STATUSES = ["employed", "self_employed", "unemployed"] as const;

const CURRENT_YEAR = new Date().getFullYear();
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const personalSchema = z.object({
  name_on_certificate: z.string().trim().min(1, "Enter the name on your certificate").max(100),
  father_guardian_name: optionalText(160),
  mother_name: optionalText(160),
  category: z.enum(CATEGORIES).optional(),
  marital_status: z.enum(MARITAL_STATUSES).optional(),
  aadhaar_last4: z
    .string()
    .regex(/^\d{4}$/, "Enter the last 4 digits only")
    .optional()
    .or(z.literal("")),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth"),
  gender: z.string().trim().min(1, "Select your gender").max(10),
  nationality: z.number().int().positive().optional(),
  abc_id: optionalText(100),
});
export type PersonalForm = z.infer<typeof personalSchema>;

// email is READ-ONLY on the public form (owned at Add Lead), so it is not part of
// the writable contact schema — the server (SECURITY MEDIUM 4) rejects it too.
export const contactSchema = z.object({
  second_phone: z.string().regex(/^\d{6,15}$/, "Enter a valid phone number").optional().or(z.literal("")),
  whatsapp_no: z.string().regex(/^\d{6,15}$/, "Enter a valid WhatsApp number").optional().or(z.literal("")),
  address: z.string().trim().min(1, "Enter your address").max(500),
  state: optionalText(100),
  district: optionalText(100),
  pin_code: z.string().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code").optional().or(z.literal("")),
});
export type ContactForm = z.infer<typeof contactSchema>;

export const qualificationRecordSchema = z.object({
  id: z.number().int().positive().optional(),
  level_code: z.enum(QUALIFICATION_LEVELS),
  label: optionalText(50),
  institution: optionalText(160),
  board: optionalText(100),
  passing_year: z
    .number()
    .int()
    .min(1950)
    .max(CURRENT_YEAR)
    .optional(),
  score_type: z.enum(SCORE_TYPES),
  score_value: z.number().min(0).max(999.99),
  score_scale: z.number().min(1).max(100).optional(),
});
export type QualificationRecordForm = z.infer<typeof qualificationRecordSchema>;

export const educationSchema = z.object({
  highest_qualification: z.enum(QUALIFICATION_LEVELS),
  records: z.array(qualificationRecordSchema).min(1, "Add at least one education record").max(12),
});
export type EducationForm = z.infer<typeof educationSchema>;

export const employmentSchema = z.object({
  employment_status: z.enum(EMPLOYMENT_STATUSES),
  total_experience_months: z.number().int().min(0).max(900).optional(),
  current_employer: optionalText(160),
  current_designation: optionalText(120),
});
export type EmploymentForm = z.infer<typeof employmentSchema>;

export const programChangeSchema = z.object({
  change_request: z.string().trim().min(1).max(500),
});
export type ProgramChangeForm = z.infer<typeof programChangeSchema>;

/** Flatten a ZodError into a { field: firstMessage } map for inline display. */
export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Drop empty/null/undefined/NaN values so optional columns are omitted, not blanked. */
export function cleanPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isNaN(v)) continue;
    out[k] = v;
  }
  return out;
}
