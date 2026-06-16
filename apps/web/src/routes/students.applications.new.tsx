import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost, ApiError } from "@/lib/api";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Send,
  X,
  Upload,
  Camera,
  Trash2,
  Plus,
  FileText,
  Image as ImageIcon,
  GraduationCap,
  Briefcase,
  User as UserIcon,
  BookOpen,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCcw,
  Download,
  PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/students/applications/new")({
  head: () => ({ meta: [{ title: "New Application — upCarrera" }] }),
  component: NewApplicationPage,
});

/* ============ Types ============ */
type StepId = "basic" | "course" | "academic" | "employment" | "documents" | "review";

interface Qualification {
  id: string;
  name: string;
  board: string;
  institution: string;
  year: string;
  score: string;
}

interface DocItem {
  key: string;
  label: string;
  required: boolean;
  file: File | null;
  status: "Not Uploaded" | "Uploaded" | "Verified" | "Rejected";
}

interface FormState {
  // basic
  photo: string | null;
  fullName: string;
  gender: string;
  dob: string;
  nationality: string;
  marital: string;
  mobile: string;
  altNumber: string;
  whatsapp: string;
  whatsappSame: boolean;
  email: string;
  country: string;
  state: string;
  city: string;
  pincode: string;
  address: string;
  // course
  university: string;
  course: string;
  specialization: string;
  intake: string;
  leadSource: string;
  referredBy: string;
  // academic
  highestQualification: string;
  qualifications: Qualification[];
  // employment
  employmentStatus: string;
  companyName: string;
  designation: string;
  industry: string;
  experience: string;
  currentLocation: string;
  // documents
  documents: DocItem[];
  // review
  agreeAccurate: boolean;
  agreeTerms: boolean;
}

const STEPS: { id: StepId; label: string; icon: typeof UserIcon }[] = [
  { id: "basic", label: "Basic Information", icon: UserIcon },
  { id: "course", label: "Course Selection", icon: BookOpen },
  { id: "academic", label: "Academic Qualification", icon: GraduationCap },
  { id: "employment", label: "Employment Information", icon: Briefcase },
  { id: "documents", label: "Documents Upload", icon: FileText },
  { id: "review", label: "Review & Submit", icon: FileCheck2 },
];

const UNIVERSITIES = [
  "Amity University Online",
  "Manipal University Online",
  "NMIMS Global",
  "Symbiosis Centre for Distance Learning",
  "Chandigarh University Online",
  "Jain University Online",
];
const COURSES = ["MBA", "BBA", "MCA", "BCA", "M.Com", "B.Com", "MA", "BA"];
const SPECIALIZATIONS = [
  "Marketing",
  "Finance",
  "Human Resources",
  "Operations",
  "Business Analytics",
  "Information Technology",
  "International Business",
];
const INTAKES = ["January 2026", "April 2026", "July 2026", "October 2026"];
const LEAD_SOURCES = [
  "Website",
  "Facebook",
  "Instagram",
  "Google Ads",
  "Referral",
  "Walk-In",
  "Education Fair",
  "Partner",
  "Counsellor Generated",
  "Other",
];
const EMPLOYMENT_STATUSES = [
  "Student",
  "Employed",
  "Self Employed",
  "Business Owner",
  "Freelancer",
  "Unemployed",
];
const HIGHEST_QUALIFICATIONS = ["10th", "12th", "Diploma", "UG", "PG", "Other"];

const INITIAL_DOCS: DocItem[] = [
  { key: "photo", label: "Photo", required: true, file: null, status: "Not Uploaded" },
  { key: "id", label: "ID Proof", required: true, file: null, status: "Not Uploaded" },
  { key: "10", label: "10th Certificate", required: true, file: null, status: "Not Uploaded" },
  { key: "12", label: "12th Certificate", required: false, file: null, status: "Not Uploaded" },
  { key: "degree", label: "Degree Certificate", required: false, file: null, status: "Not Uploaded" },
  { key: "marksheets", label: "Marksheets", required: false, file: null, status: "Not Uploaded" },
  { key: "experience", label: "Experience Certificate", required: false, file: null, status: "Not Uploaded" },
  { key: "other", label: "Other Supporting Documents", required: false, file: null, status: "Not Uploaded" },
];

const INITIAL_FORM: FormState = {
  photo: null,
  fullName: "",
  gender: "",
  dob: "",
  nationality: "Indian",
  marital: "",
  mobile: "",
  altNumber: "",
  whatsapp: "",
  whatsappSame: false,
  email: "",
  country: "India",
  state: "",
  city: "",
  pincode: "",
  address: "",
  university: "",
  course: "",
  specialization: "",
  intake: "",
  leadSource: "",
  referredBy: "",
  highestQualification: "",
  qualifications: [
    { id: crypto.randomUUID(), name: "", board: "", institution: "", year: "", score: "" },
  ],
  employmentStatus: "",
  companyName: "",
  designation: "",
  industry: "",
  experience: "",
  currentLocation: "",
  documents: INITIAL_DOCS,
  agreeAccurate: false,
  agreeTerms: false,
};

/* ============ Component ============ */
function NewApplicationPage() {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // POST /applications — only the bio/contact fields the create endpoint accepts
  // are sent. Course/academic/employment/document data are captured later via
  // the academic + qualifications + documents endpoints, not at create time.
  const createApplication = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<{ application_id: number; custom_application_id: string | null }>(
        "/applications",
        payload,
      ),
    onSuccess: (row) => {
      const id =
        row.custom_application_id && String(row.custom_application_id).trim() !== ""
          ? String(row.custom_application_id)
          : `APP-${row.application_id}`;
      setSubmitError(null);
      setSubmitted({ id });
    },
    onError: (err) => {
      setSubmitError(
        err instanceof ApiError ? err.message : "Failed to submit application. Please try again.",
      );
    },
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Auto-save every 60s
  useEffect(() => {
    const t = setInterval(() => setSavedAt(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Warn on leave
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (submitted) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [submitted]);

  // Age calc
  const age = useMemo(() => {
    if (!form.dob) return "";
    const d = new Date(form.dob);
    if (isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
  }, [form.dob]);

  // Whatsapp sync
  useEffect(() => {
    if (form.whatsappSame) set("whatsapp", form.mobile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.whatsappSame, form.mobile]);

  const validateStep = (idx: number): boolean => {
    const e: Record<string, string> = {};
    if (idx === 0) {
      if (!form.fullName.trim()) e.fullName = "Required";
      if (!form.gender) e.gender = "Required";
      if (!form.dob) e.dob = "Required";
      if (!form.nationality) e.nationality = "Required";
      if (!form.mobile.trim()) e.mobile = "Required";
      if (!form.email.trim()) e.email = "Required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
      if (!form.country) e.country = "Required";
      if (!form.state) e.state = "Required";
      if (!form.city) e.city = "Required";
      if (!form.address.trim()) e.address = "Required";
    } else if (idx === 1) {
      if (!form.university) e.university = "Required";
      if (!form.course) e.course = "Required";
      if (!form.intake) e.intake = "Required";
      if (!form.leadSource) e.leadSource = "Required";
      if (form.leadSource === "Referral" && !form.referredBy.trim()) e.referredBy = "Required";
    } else if (idx === 2) {
      if (!form.highestQualification) e.highestQualification = "Required";
      form.qualifications.forEach((q, i) => {
        if (!q.name.trim()) e[`q_${i}_name`] = "Required";
        if (!q.board.trim()) e[`q_${i}_board`] = "Required";
        if (!q.institution.trim()) e[`q_${i}_institution`] = "Required";
        if (!q.year.trim()) e[`q_${i}_year`] = "Required";
        if (!q.score.trim()) e[`q_${i}_score`] = "Required";
      });
    } else if (idx === 3) {
      if (!form.employmentStatus) e.employmentStatus = "Required";
    } else if (idx === 5) {
      if (!form.agreeAccurate) e.agreeAccurate = "You must confirm accuracy";
      if (!form.agreeTerms) e.agreeTerms = "You must agree to terms";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (validateStep(stepIdx)) setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  };
  const prev = () => setStepIdx((i) => Math.max(0, i - 1));

  const handlePhoto = (file: File) => {
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => set("photo", reader.result as string);
    reader.readAsDataURL(file);
  };

  const addQualification = () =>
    set("qualifications", [
      ...form.qualifications,
      { id: crypto.randomUUID(), name: "", board: "", institution: "", year: "", score: "" },
    ]);
  const removeQualification = (id: string) =>
    set(
      "qualifications",
      form.qualifications.filter((q) => q.id !== id),
    );
  const updateQual = (id: string, field: keyof Qualification, value: string) =>
    set(
      "qualifications",
      form.qualifications.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    );

  const uploadDoc = (key: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) return;
    set(
      "documents",
      form.documents.map((d) => (d.key === key ? { ...d, file, status: "Uploaded" } : d)),
    );
  };
  const removeDoc = (key: string) =>
    set(
      "documents",
      form.documents.map((d) => (d.key === key ? { ...d, file: null, status: "Not Uploaded" } : d)),
    );

  const submit = () => {
    if (!validateStep(5)) return;
    // Map the form's bio/contact fields onto the create-application DTO. Empty
    // values are dropped so the API's NOT-NULL defaults / optional handling apply.
    const payload: Record<string, unknown> = {};
    if (form.fullName.trim()) payload.name = form.fullName.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.mobile.trim()) payload.phone = form.mobile.trim();
    if (form.dob) payload.dob = form.dob;
    if (form.gender) payload.gender = form.gender;
    if (form.whatsapp.trim()) payload.whatsapp_no = form.whatsapp.trim();
    if (form.altNumber.trim()) payload.second_phone = form.altNumber.trim();
    if (form.state.trim()) payload.state = form.state.trim();
    if (form.city.trim()) payload.district = form.city.trim();
    if (form.address.trim()) payload.address = form.address.trim();
    createApplication.mutate(payload);
  };

  const saveDraft = () => setSavedAt(new Date());

  /* ============ Success Screen ============ */
  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-12 text-center shadow-card">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PartyPopper className="h-10 w-10" />
          </div>
          <h1 className="mt-6 text-2xl sm:text-3xl font-semibold text-foreground">
            Application Submitted Successfully
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your admission application has been received. Our team will reach out shortly.
          </p>
          <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-6 text-left">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Application ID
            </div>
            <div className="mt-1 text-xl font-bold text-primary">{submitted.id}</div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <SummaryItem label="Student Name" value={form.fullName} />
              <SummaryItem label="University" value={form.university} />
              <SummaryItem label="Course" value={form.course} />
              <SummaryItem label="Admission Intake" value={form.intake} />
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/students/applications"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              <Eye className="h-4 w-4" />
              View Application
            </Link>
            <button
              onClick={() => {
                setSubmitted(null);
                setForm(INITIAL_FORM);
                setStepIdx(0);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create New Application
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Student Management / Applications
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            New Application
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture complete student admission information.
            {savedAt && (
              <span className="ml-2 text-xs text-primary">
                · Draft saved {savedAt.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate({ to: "/students/applications" })}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            onClick={saveDraft}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Save className="h-4 w-4" />
            Save Draft
          </button>
          <button
            onClick={() => (stepIdx === STEPS.length - 1 ? submit() : next())}
            disabled={createApplication.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
            {createApplication.isPending ? "Submitting…" : "Submit Application"}
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <ol className="flex flex-wrap items-center gap-y-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === stepIdx;
            const done = i < stepIdx;
            return (
              <li key={s.id} className="flex items-center gap-3 flex-1 min-w-[140px]">
                <button
                  onClick={() => i <= stepIdx && setStepIdx(i)}
                  className={cn(
                    "flex items-center gap-3 group",
                    i > stepIdx && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 place-items-center rounded-full border-2 transition",
                      done && "bg-primary border-primary text-primary-foreground",
                      active && "border-primary text-primary bg-primary/10",
                      !done && !active && "border-border text-muted-foreground bg-surface",
                    )}
                  >
                    {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </span>
                  <div className="hidden md:block text-left">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Step {i + 1}
                    </div>
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        active ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </div>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "hidden md:block h-0.5 flex-1 rounded-full",
                      i < stepIdx ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
        {/* Mobile progress bar */}
        <div className="md:hidden mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {stepIdx + 1} of {STEPS.length}</span>
            <span className="font-semibold text-foreground">{STEPS[stepIdx].label}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-2xl border border-border bg-surface shadow-card">
        {stepIdx === 0 && (
          <StepBasic
            form={form}
            set={set}
            errors={errors}
            age={age}
            photoRef={photoRef}
            handlePhoto={handlePhoto}
          />
        )}
        {stepIdx === 1 && <StepCourse form={form} set={set} errors={errors} />}
        {stepIdx === 2 && (
          <StepAcademic
            form={form}
            set={set}
            errors={errors}
            addQualification={addQualification}
            removeQualification={removeQualification}
            updateQual={updateQual}
          />
        )}
        {stepIdx === 3 && <StepEmployment form={form} set={set} errors={errors} />}
        {stepIdx === 4 && <StepDocuments form={form} uploadDoc={uploadDoc} removeDoc={removeDoc} />}
        {stepIdx === 5 && <StepReview form={form} errors={errors} set={set} goTo={setStepIdx} />}

        {submitError && (
          <div className="mx-6 mb-2 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Footer Nav */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={prev}
            disabled={stepIdx === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>
          <div className="text-xs text-muted-foreground">
            Step {stepIdx + 1} of {STEPS.length}
          </div>
          {stepIdx < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={createApplication.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
              {createApplication.isPending ? "Submitting…" : "Submit Application"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ Reusable Inputs ============ */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 sm:p-8">
      <div className="border-b border-border pb-4 mb-6">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full h-10 rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}
function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputCls, "appearance-none pr-9 cursor-pointer", props.className)}>
      {props.children}
    </select>
  );
}

/* ============ Step 1 ============ */
function StepBasic({
  form,
  set,
  errors,
  age,
  photoRef,
  handlePhoto,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
  age: string;
  photoRef: React.RefObject<HTMLInputElement | null>;
  handlePhoto: (f: File) => void;
}) {
  return (
    <>
      <Section title="Basic Information" description="Profile photo and personal details.">
        {/* Photo */}
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
          <div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handlePhoto(f);
              }}
              className="group relative mx-auto h-40 w-40 rounded-full border-2 border-dashed border-border bg-muted/30 grid place-items-center overflow-hidden cursor-pointer hover:border-primary transition"
              onClick={() => photoRef.current?.click()}
            >
              {form.photo ? (
                <img src={form.photo} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center p-4">
                  <Camera className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="mt-2 text-xs text-muted-foreground">Drag & drop or click</p>
                </div>
              )}
              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/png"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhoto(f);
                }}
              />
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Upload className="h-3 w-3" /> {form.photo ? "Replace" : "Upload"}
              </button>
              {form.photo && (
                <button
                  type="button"
                  onClick={() => set("photo", null)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">JPG, PNG · Max 5 MB</p>
          </div>

          {/* Personal Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Full Name" required error={errors.fullName} className="sm:col-span-2">
              <TextInput
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                placeholder="e.g. Rohan Sharma"
              />
            </Field>
            <Field label="Gender" required error={errors.gender}>
              <SelectInput value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Select gender</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </SelectInput>
            </Field>
            <Field label="Date of Birth" required error={errors.dob}>
              <TextInput type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            </Field>
            <Field label="Age">
              <TextInput value={age} readOnly placeholder="Auto-calculated" />
            </Field>
            <Field label="Nationality" required error={errors.nationality}>
              <TextInput
                value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)}
              />
            </Field>
            <Field label="Marital Status">
              <SelectInput value={form.marital} onChange={(e) => set("marital", e.target.value)}>
                <option value="">Select status</option>
                <option>Single</option>
                <option>Married</option>
                <option>Divorced</option>
                <option>Widowed</option>
              </SelectInput>
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Contact Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Mobile Number" required error={errors.mobile}>
            <TextInput
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value)}
              placeholder="+91 98765 43210"
            />
          </Field>
          <Field label="Alternative Number">
            <TextInput value={form.altNumber} onChange={(e) => set("altNumber", e.target.value)} />
          </Field>
          <Field label="WhatsApp Number">
            <div className="space-y-2">
              <TextInput
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                disabled={form.whatsappSame}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.whatsappSame}
                  onChange={(e) => set("whatsappSame", e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Same as Mobile Number
              </label>
            </div>
          </Field>
          <Field label="Email Address" required error={errors.email}>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
        </div>
      </Section>

      <Section title="Address">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Country" required error={errors.country}>
            <TextInput value={form.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="State" required error={errors.state}>
            <TextInput value={form.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="City" required error={errors.city}>
            <TextInput value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Pincode">
            <TextInput value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
          </Field>
          <Field label="Full Address" required error={errors.address} className="sm:col-span-2 lg:col-span-4">
            <textarea
              rows={3}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="House no, street, locality, landmark"
            />
          </Field>
        </div>
      </Section>
    </>
  );
}

/* ============ Step 2 ============ */
function StepCourse({
  form,
  set,
  errors,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Section title="Admission Information" description="Select university, course and intake.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="University" required error={errors.university}>
            <SelectInput value={form.university} onChange={(e) => set("university", e.target.value)}>
              <option value="">Search & select university</option>
              {UNIVERSITIES.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Course" required error={errors.course}>
            <SelectInput
              value={form.course}
              onChange={(e) => set("course", e.target.value)}
              disabled={!form.university}
            >
              <option value="">Select course</option>
              {COURSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Specialization">
            <SelectInput
              value={form.specialization}
              onChange={(e) => set("specialization", e.target.value)}
              disabled={!form.course}
            >
              <option value="">Select specialization</option>
              {SPECIALIZATIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Intake" required error={errors.intake}>
            <SelectInput
              value={form.intake}
              onChange={(e) => set("intake", e.target.value)}
              disabled={!form.course}
            >
              <option value="">Select intake</option>
              {INTAKES.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Section>

      <Section title="Source Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Lead Source" required error={errors.leadSource}>
            <SelectInput value={form.leadSource} onChange={(e) => set("leadSource", e.target.value)}>
              <option value="">Select lead source</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectInput>
          </Field>
          {form.leadSource === "Referral" && (
            <Field label="Referred By Student" required error={errors.referredBy}>
              <TextInput
                value={form.referredBy}
                onChange={(e) => set("referredBy", e.target.value)}
                placeholder="Search referring student"
              />
            </Field>
          )}
        </div>
      </Section>
    </>
  );
}

/* ============ Step 3 ============ */
function StepAcademic({
  form,
  set,
  errors,
  addQualification,
  removeQualification,
  updateQual,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
  addQualification: () => void;
  removeQualification: (id: string) => void;
  updateQual: (id: string, f: keyof Qualification, v: string) => void;
}) {
  return (
    <Section title="Academic Qualification" description="Add all relevant academic records.">
      <div className="max-w-md mb-6">
        <Field label="Highest Qualification" required error={errors.highestQualification}>
          <SelectInput
            value={form.highestQualification}
            onChange={(e) => set("highestQualification", e.target.value)}
          >
            <option value="">Select qualification</option>
            {HIGHEST_QUALIFICATIONS.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <div className="space-y-4">
        {form.qualifications.map((q, i) => (
          <div key={q.id} className="rounded-2xl border border-border bg-muted/20 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {i + 1}
                </span>
                <h3 className="font-semibold text-foreground">Qualification {i + 1}</h3>
              </div>
              {form.qualifications.length > 1 && (
                <button
                  onClick={() => removeQualification(q.id)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Qualification Name" required error={errors[`q_${i}_name`]}>
                <TextInput
                  value={q.name}
                  onChange={(e) => updateQual(q.id, "name", e.target.value)}
                  placeholder="e.g. 12th, Bachelor Degree"
                />
              </Field>
              <Field label="Board / University" required error={errors[`q_${i}_board`]}>
                <TextInput
                  value={q.board}
                  onChange={(e) => updateQual(q.id, "board", e.target.value)}
                />
              </Field>
              <Field label="Institution Name" required error={errors[`q_${i}_institution`]}>
                <TextInput
                  value={q.institution}
                  onChange={(e) => updateQual(q.id, "institution", e.target.value)}
                />
              </Field>
              <Field label="Year of Passing" required error={errors[`q_${i}_year`]}>
                <TextInput
                  value={q.year}
                  onChange={(e) => updateQual(q.id, "year", e.target.value)}
                  placeholder="e.g. 2021"
                />
              </Field>
              <Field label="Percentage / CGPA" required error={errors[`q_${i}_score`]}>
                <TextInput
                  value={q.score}
                  onChange={(e) => updateQual(q.id, "score", e.target.value)}
                  placeholder="e.g. 78% or 8.4"
                />
              </Field>
            </div>
          </div>
        ))}
        <button
          onClick={addQualification}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5 hover:border-primary transition w-full justify-center"
        >
          <Plus className="h-4 w-4" /> Add Qualification
        </button>
      </div>
    </Section>
  );
}

/* ============ Step 4 ============ */
function StepEmployment({
  form,
  set,
  errors,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
}) {
  const showCompany = ["Employed", "Self Employed", "Business Owner", "Freelancer"].includes(
    form.employmentStatus,
  );
  return (
    <Section title="Employment Information" description="Tell us about your current professional status.">
      <div className="max-w-md mb-6">
        <Field label="Employment Status" required error={errors.employmentStatus}>
          <SelectInput
            value={form.employmentStatus}
            onChange={(e) => set("employmentStatus", e.target.value)}
          >
            <option value="">Select status</option>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </SelectInput>
        </Field>
      </div>

      {showCompany && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Company Name">
            <TextInput
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
            />
          </Field>
          <Field label="Designation">
            <TextInput
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
            />
          </Field>
          <Field label="Industry">
            <TextInput value={form.industry} onChange={(e) => set("industry", e.target.value)} />
          </Field>
          <Field label="Total Experience">
            <TextInput
              value={form.experience}
              onChange={(e) => set("experience", e.target.value)}
              placeholder="e.g. 4 years"
            />
          </Field>
          <Field label="Current Location" className="sm:col-span-2">
            <TextInput
              value={form.currentLocation}
              onChange={(e) => set("currentLocation", e.target.value)}
            />
          </Field>
        </div>
      )}
    </Section>
  );
}

/* ============ Step 5 ============ */
function StepDocuments({
  form,
  uploadDoc,
  removeDoc,
}: {
  form: FormState;
  uploadDoc: (k: string, f: File) => void;
  removeDoc: (k: string) => void;
}) {
  return (
    <Section title="Required Documents" description="Upload all required documents. PDF, JPG, PNG · Max 10 MB each.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {form.documents.map((d) => (
          <DocCard key={d.key} doc={d} onUpload={(f) => uploadDoc(d.key, f)} onRemove={() => removeDoc(d.key)} />
        ))}
      </div>
    </Section>
  );
}

function DocCard({
  doc,
  onUpload,
  onRemove,
}: {
  doc: DocItem;
  onUpload: (f: File) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const statusStyle: Record<DocItem["status"], string> = {
    "Not Uploaded": "bg-muted text-muted-foreground",
    Uploaded: "bg-sky-100 text-sky-700",
    Verified: "bg-emerald-100 text-emerald-700",
    Rejected: "bg-red-100 text-red-700",
  };
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onUpload(f);
      }}
      className="rounded-2xl border border-border bg-surface p-4 hover:border-primary/40 transition"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
            {doc.file?.type.startsWith("image") ? (
              <ImageIcon className="h-4 w-4" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {doc.label} {doc.required && <span className="text-destructive">*</span>}
            </div>
            <span
              className={cn(
                "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                statusStyle[doc.status],
              )}
            >
              {doc.status}
            </span>
          </div>
        </div>
      </div>
      {doc.file ? (
        <div>
          <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-foreground truncate">
            {doc.file.name}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
            >
              <RefreshCcw className="h-3 w-3" /> Replace
            </button>
            <button className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
              <Eye className="h-3 w-3" /> Preview
            </button>
            <button className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
              <Download className="h-3 w-3" />
            </button>
            <button
              onClick={onRemove}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-border bg-muted/20 p-4 text-center hover:border-primary hover:bg-primary/5 transition"
        >
          <Upload className="h-5 w-5 text-muted-foreground mx-auto" />
          <p className="mt-1.5 text-xs font-medium text-foreground">Drag & drop or browse</p>
          <p className="text-[10px] text-muted-foreground">PDF, JPG, PNG · Max 10 MB</p>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept=".pdf,image/jpeg,image/png"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
        }}
      />
    </div>
  );
}

/* ============ Step 6 ============ */
function StepReview({
  form,
  errors,
  set,
  goTo,
}: {
  form: FormState;
  errors: Record<string, string>;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  goTo: (i: number) => void;
}) {
  const uploaded = form.documents.filter((d) => d.file).length;
  return (
    <Section title="Review & Submit" description="Verify all details before submitting.">
      <div className="space-y-4">
        <ReviewBlock title="Basic Information" onEdit={() => goTo(0)}>
          <SummaryItem label="Full Name" value={form.fullName} />
          <SummaryItem label="Gender" value={form.gender} />
          <SummaryItem label="Date of Birth" value={form.dob} />
          <SummaryItem label="Nationality" value={form.nationality} />
          <SummaryItem label="Mobile" value={form.mobile} />
          <SummaryItem label="Email" value={form.email} />
          <SummaryItem
            label="Address"
            value={`${form.address}, ${form.city}, ${form.state}, ${form.country} ${form.pincode}`}
          />
        </ReviewBlock>

        <ReviewBlock title="Course Selection" onEdit={() => goTo(1)}>
          <SummaryItem label="University" value={form.university} />
          <SummaryItem label="Course" value={form.course} />
          <SummaryItem label="Specialization" value={form.specialization} />
          <SummaryItem label="Intake" value={form.intake} />
          <SummaryItem label="Lead Source" value={form.leadSource} />
          {form.leadSource === "Referral" && (
            <SummaryItem label="Referred By" value={form.referredBy} />
          )}
        </ReviewBlock>

        <ReviewBlock title="Academic Qualification" onEdit={() => goTo(2)}>
          <SummaryItem label="Highest Qualification" value={form.highestQualification} />
          <div className="sm:col-span-2 mt-2 space-y-2">
            {form.qualifications.map((q, i) => (
              <div key={q.id} className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <span className="font-semibold">#{i + 1}</span> {q.name} · {q.institution} ·{" "}
                {q.year} · {q.score}
              </div>
            ))}
          </div>
        </ReviewBlock>

        <ReviewBlock title="Employment Information" onEdit={() => goTo(3)}>
          <SummaryItem label="Employment Status" value={form.employmentStatus} />
          {form.companyName && <SummaryItem label="Company" value={form.companyName} />}
          {form.designation && <SummaryItem label="Designation" value={form.designation} />}
          {form.experience && <SummaryItem label="Experience" value={form.experience} />}
        </ReviewBlock>

        <ReviewBlock title="Documents Uploaded" onEdit={() => goTo(4)}>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {form.documents.map((d) => (
              <span
                key={d.key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  d.file
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {d.file ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {d.label}
              </span>
            ))}
            <div className="ml-auto text-xs text-muted-foreground">
              {uploaded} / {form.documents.length} uploaded
            </div>
          </div>
        </ReviewBlock>

        <div className="rounded-2xl border border-border bg-muted/20 p-5 space-y-3">
          <h3 className="font-semibold text-foreground">Declaration</h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.agreeAccurate}
              onChange={(e) => set("agreeAccurate", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm text-foreground">
              I confirm that all information provided is true and accurate.
            </span>
          </label>
          {errors.agreeAccurate && (
            <p className="ml-7 text-xs text-destructive">{errors.agreeAccurate}</p>
          )}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.agreeTerms}
              onChange={(e) => set("agreeTerms", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm text-foreground">
              I agree to the admission terms and conditions.
            </span>
          </label>
          {errors.agreeTerms && (
            <p className="ml-7 text-xs text-destructive">{errors.agreeTerms}</p>
          )}
        </div>
      </div>
    </Section>
  );
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <button
          onClick={onEdit}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Edit
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-foreground break-words">
        {value || <span className="text-muted-foreground/60">—</span>}
      </div>
    </div>
  );
}
