// Response shapes for the student profile — GET /students/:id and its
// /documents and /timeline sub-resources (apiGet unwraps the envelope).

export interface ApiInvoice {
  id: number;
  payment_status: string | null;
  payable_amount: number | null;
  date: string | null;
  due_date: string | null;
  paid_amount_total: number;
  outstanding_amount: number;
}

export interface ApiPayment {
  id: number;
  invoice_id: number | null;
  payment_type: string | null;
  paid_amount: number | null;
  payment_date: string | null;
  reference_no: string | null;
}

/** A student_payments row — the fee ledger the legacy CRM and the convert step write. */
export interface ApiInstallment {
  student_payment_id: number;
  installment_details: string | null;
  amount: number | null;
  due_date: string | null;
  paid_date: string | null;
  payment_mode: string | null;
  payment_to: string | null;
  status: string | null;
  is_paid: boolean;
}

export interface ApiCourseFee {
  /** The fee that applies: the special fee if one is set, else the specialisation's. */
  amount: number | null;
  standard_amount: number | null;
  special_fee: number | null;
  special_reason: string | null;
}

export interface ApiFinance {
  total: number;
  paid: number;
  outstanding: number;
  invoice_count: number;
  payment_count: number;
  invoices: ApiInvoice[];
  payments: ApiPayment[];
  total_basis: "course_fee" | "installments" | "invoices" | "none";
  course_fee: ApiCourseFee;
  installment_count: number;
  installments_paid: number;
  installments_pending: number;
  installments: ApiInstallment[];
}

export type ApplicationLinkBasis = "application_id" | "records" | "contact";

export interface ApiLinkedApplication {
  application_id: number;
  display_id: string;
  enrollment_id: string | null;
  created_at: string | null;
  created_by_name: string | null;
  converted_at: string | null;
  converted_by_name: string | null;
  is_converted: boolean;
  link_basis: ApplicationLinkBasis;
}

export interface ApiStudentDetail {
  id: number;
  student_id: number;
  enrollment_id: string | null;
  application_id: string | null;
  enrollment_date: string | null;
  admission_status: number | null;
  course_id: number | null;
  specialisation_id: number | null;
  session_id: number | null;
  consultant_id: number | null;
  mode: string | null;
  source: string | null;
  abc_id: string | null;
  whatsapp_no: string | null;
  created_at: string | null;
  // decorated joins
  name: string | null;
  email: string | null;
  phone: string | null;
  dial_code: number | null;
  profile_picture: string | null;
  consultant_name: string | null;
  course_title: string | null;
  university_id: number | null;
  university_title: string | null;
  specialisation_title: string | null;
  session_title: string | null;
  admission_status_label: string | null;
  finance: ApiFinance | null;
  application: ApiLinkedApplication | null;
}

export interface ApiStudentDocument {
  student_document_id: number;
  label: string | null;
  file: string | null;
  created_at: string | null;
  uploaded_by_name: string | null;
  source: "student" | "application";
}

export interface ApiTimelineEvent {
  key: string;
  type:
    | "application_created"
    | "application_converted"
    | "student_created"
    | "enrolled"
    | "course_enrolment"
    | "payment_received"
    | "installment_scheduled"
    | "invoice_issued"
    | "invoice_payment"
    | "document_uploaded"
    | "dropout"
    | "profile_updated";
  at: string;
  title: string;
  detail: string | null;
  actor_name: string | null;
}

export interface ApiTimeline {
  items: ApiTimelineEvent[];
  total: number;
}
