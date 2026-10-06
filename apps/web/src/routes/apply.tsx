import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RefreshCcw,
} from "lucide-react";
import {
  clearApplicantSession,
  exchangeToken,
  getApplication,
  getLookups,
  refreshSession,
  ApplicantApiError,
  LINK_DEAD_EVENT,
  type LinkDeadCode,
  type SubmitResult,
} from "@/lib/applicant-api";
import { getApplicantSession, getApplicantToken } from "@/lib/applicant-session";
import { ApplyShell, type ApplyStep } from "@/components/apply/apply-shell";
import { ReopenBanner } from "@/components/apply/reopen-banner";
import { PersonalSection } from "@/components/apply/personal-section";
import { ContactSection } from "@/components/apply/contact-section";
import { ProgramSection } from "@/components/apply/program-section";
import { EducationSection } from "@/components/apply/education-section";
import { EmploymentSection } from "@/components/apply/employment-section";
import { DocumentsSection } from "@/components/apply/documents-section";
import { DeclarationSection } from "@/components/apply/declaration-section";
import type { SectionProps } from "@/components/apply/types";

export const Route = createFileRoute("/apply")({
  validateSearch: (search: Record<string, unknown>): { step?: string } => ({
    step: typeof search.step === "string" ? search.step : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Complete your application — upCarrera" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ApplyPage,
});

type Phase = "init" | "ready" | "dead" | "submitted" | "no-link";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // slide the 2h session while active

function ApplyPage() {
  const { step } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [phase, setPhase] = useState<Phase>("init");
  const [deadCode, setDeadCode] = useState<LinkDeadCode | null>(null);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const handledHash = useRef(false);

  // --- 1. On mount: exchange a #t=<token> hash, or use an existing session. ---
  useEffect(() => {
    if (handledHash.current) return;
    handledHash.current = true;

    const match = window.location.hash.match(/[#&]t=([A-Za-z0-9_-]+)/);
    if (match) {
      const token = match[1];
      // Strip the token from the URL + history immediately (it must not linger).
      const clean = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", clean);
      exchangeToken(token)
        .then(() => setPhase("ready"))
        .catch((e) => applyDeadFromError(e));
      return;
    }
    setPhase(getApplicantToken() ? "ready" : "no-link");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyDeadFromError = useCallback((e: unknown) => {
    if (e instanceof ApplicantApiError && e.code === "ALREADY_SUBMITTED") {
      const data = e.data as { submitted_at?: string } | undefined;
      setSubmitted({ submitted: true, application_id: "", submitted_at: data?.submitted_at ?? "" });
      setPhase("submitted");
      return;
    }
    setDeadCode(e instanceof ApplicantApiError ? (e.code as LinkDeadCode) ?? "LINK_INVALID" : "LINK_INVALID");
    setPhase("dead");
  }, []);

  // --- 2. Global dead-link listener (fired by the api client on 401/410). ---
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ code: LinkDeadCode; data?: unknown }>).detail;
      if (detail.code === "ALREADY_SUBMITTED") {
        const data = detail.data as { submitted_at?: string } | undefined;
        setSubmitted({ submitted: true, application_id: "", submitted_at: data?.submitted_at ?? "" });
        setPhase("submitted");
      } else {
        setDeadCode(detail.code);
        setPhase("dead");
      }
    };
    window.addEventListener(LINK_DEAD_EVENT, handler);
    return () => window.removeEventListener(LINK_DEAD_EVENT, handler);
  }, []);

  // --- 3. Data ---
  const appQuery = useQuery({
    queryKey: ["applicant-app"],
    queryFn: getApplication,
    enabled: phase === "ready",
    retry: false,
  });
  const lookupsQuery = useQuery({
    queryKey: ["applicant-lookups"],
    queryFn: getLookups,
    enabled: phase === "ready",
    retry: false,
    staleTime: 10 * 60 * 1000,
  });

  const reload = useCallback(async () => {
    await appQuery.refetch();
  }, [appQuery]);

  // --- 4. Sliding session refresh while the form is open. ---
  useEffect(() => {
    if (phase !== "ready") return;
    const id = window.setInterval(() => {
      const session = getApplicantSession();
      if (!session) return;
      refreshSession().catch(() => {
        /* a dead session dispatches LINK_DEAD_EVENT, handled above */
      });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  // --- 5. Warn before leaving while a save/upload is in flight. ---
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  const app = appQuery.data;
  const lookups = lookupsQuery.data;

  const steps: ApplyStep[] = useMemo(() => {
    if (!app) return [];
    const base = [
      { key: "personal", label: "Personal" },
      { key: "contact", label: "Contact" },
      { key: "program", label: "Program" },
      { key: "education", label: "Education" },
    ];
    if (app.employment_required) base.push({ key: "employment", label: "Employment" });
    base.push({ key: "documents", label: "Documents" });
    base.push({ key: "declaration", label: "Review" });
    return base.map((s) => ({
      ...s,
      complete: app.progress.steps.find((ps) => ps.key === s.key)?.complete ?? false,
    }));
  }, [app]);

  const currentStep = useMemo(() => {
    if (!steps.length) return "personal";
    if (step && steps.some((s) => s.key === step)) return step;
    return steps.find((s) => !s.complete)?.key ?? steps[0].key;
  }, [steps, step]);

  const goTo = useCallback(
    (key: string) => {
      navigate({ search: { step: key } });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [navigate],
  );

  const goNext = useCallback(() => {
    const idx = steps.findIndex((s) => s.key === currentStep);
    const next = steps[idx + 1];
    if (next) goTo(next.key);
  }, [steps, currentStep, goTo]);

  // --- Render by phase ---
  if (phase === "init" || (phase === "ready" && (appQuery.isLoading || lookupsQuery.isLoading))) {
    return <LoadingScreen />;
  }
  if (phase === "no-link") return <NoLinkScreen />;
  if (phase === "submitted") return <SubmittedScreen submittedAt={submitted?.submitted_at ?? null} />;
  if (phase === "dead") return <DeadLinkScreen code={deadCode} />;

  if (appQuery.isError || !app || !lookups) {
    return <ErrorScreen onRetry={() => appQuery.refetch()} />;
  }

  const sectionProps: SectionProps = { app, lookups, busy, setBusy, reload, goNext };

  return (
    <ApplyShell
      applicationId={app.application_id}
      steps={steps}
      currentStep={currentStep}
      onNavigate={goTo}
      expiresAt={app.link_expires_at}
      onSaveExit={() => {
        clearApplicantSession();
        setPhase("no-link");
      }}
    >
      <ReopenBanner reason={app.reopen_reason} />
      {currentStep === "personal" && <PersonalSection {...sectionProps} />}
      {currentStep === "contact" && <ContactSection {...sectionProps} />}
      {currentStep === "program" && <ProgramSection {...sectionProps} />}
      {currentStep === "education" && <EducationSection {...sectionProps} />}
      {currentStep === "employment" && <EmploymentSection {...sectionProps} />}
      {currentStep === "documents" && <DocumentsSection {...sectionProps} />}
      {currentStep === "declaration" && (
        <DeclarationSection
          app={app}
          busy={busy}
          setBusy={setBusy}
          onSubmitted={(result) => {
            setSubmitted(result);
            setPhase("submitted");
            clearApplicantSession();
          }}
        />
      )}
    </ApplyShell>
  );
}

/* ---------------- status screens ---------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">{children}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <Shell>
      <Loader2 className="mx-auto h-9 w-9 animate-spin text-muted-foreground/50" />
      <p className="mt-4 text-sm font-semibold text-foreground">Opening your application…</p>
    </Shell>
  );
}

function NoLinkScreen() {
  return (
    <Shell>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Mail className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-foreground">Open the link from your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        To continue your application, please tap the secure link we emailed you. If you can't find it, ask your
        counsellor to resend it.
      </p>
    </Shell>
  );
}

function SubmittedScreen({ submittedAt }: { submittedAt: string | null }) {
  const when = submittedAt ? new Date(submittedAt) : null;
  const whenLabel = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : null;
  return (
    <Shell>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-foreground">Application submitted</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Thank you! Your application has been received and your counsellor will be in touch.
      </p>
      {whenLabel && <p className="mt-3 text-xs text-muted-foreground">Submitted on {whenLabel}</p>}
    </Shell>
  );
}

function DeadLinkScreen({ code }: { code: LinkDeadCode | null }) {
  const copy =
    code === "LINK_REPLACED"
      ? {
          title: "A newer link was sent",
          body: "This link was replaced by a more recent one. Please open the latest email we sent you.",
        }
      : code === "LINK_EXPIRED"
        ? {
            title: "This link has expired",
            body: "For your security, application links expire after a while. Ask your counsellor for a fresh link.",
          }
        : {
            title: "This link isn't valid",
            body: "The link may be incomplete or already used. Please open the link from your email, or ask your counsellor for a new one.",
          };
  return (
    <Shell>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
        <Clock className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-foreground">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
    </Shell>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Shell>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-foreground">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">We couldn't load your application. Please try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        <RefreshCcw className="h-4 w-4" /> Try again
      </button>
    </Shell>
  );
}
