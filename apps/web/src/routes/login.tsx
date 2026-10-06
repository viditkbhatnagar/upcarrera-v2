import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { login } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { BrandLogo } from "@/components/brand/brand-logo";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — upCarrera Admission & Student Success Portal" },
      {
        name: "description",
        content:
          "Secure admin login for the upCarrera Education Admission & Student Success Portal.",
      },
    ],
  }),
  component: LoginPage,
});

type Screen = "login" | "forgot";

function getGreeting(date: Date) {
  const h = date.getHours();
  if (h >= 5 && h < 12)
    return {
      greeting: "Good Morning",
      message:
        "Start today with clarity. Every admission is a new student journey.",
    };
  if (h >= 12 && h < 17)
    return {
      greeting: "Good Afternoon",
      message:
        "Keep moving forward. Your follow-ups create student success.",
    };
  if (h >= 17 && h < 21)
    return {
      greeting: "Good Evening",
      message:
        "Great work today. Every update brings the team closer to its goals.",
    };
  return {
    greeting: "Good Night",
    message:
      "Securely access your workspace and stay prepared for tomorrow.",
  };
}

export function LoginPage() {
  const [screen, setScreen] = useState<Screen>("login");

  // login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // Password resets are performed by an administrator (ForgotContact explains how),
  // so the login screen holds no reset form state.

  const [{ greeting, message }, setGreeting] = useState({
    greeting: "Welcome",
    message: "Login to continue to your upCarrera workspace.",
  });

  useEffect(() => {
    setGreeting(getGreeting(new Date()));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter your email / user ID and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      // Full reload into the app rather than an SPA hop. The root layout decides
      // AppShell-vs-bare from the path once per mount, so a client navigate left
      // the dashboard rendered WITHOUT its shell until a manual refresh. A hard
      // navigation mounts the authenticated app cleanly (mirrors sign-out).
      window.location.assign("/dashboard");
    } catch (err) {
      let msg = "Login failed. Please try again.";
      if (err instanceof ApiError) {
        // A 401 here is a credentials failure. Show one neutral message for a
        // bad id/password (never reveal which was wrong), but surface a
        // deactivated-account notice since that needs the administrator.
        msg =
          err.status === 401
            ? /deactivat/i.test(err.message)
              ? err.message
              : "Invalid email / user ID or password."
            : err.message;
      }
      toast.error(msg);
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* LEFT BRANDING PANEL */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.32 0.07 165) 0%, oklch(0.24 0.06 165) 55%, oklch(0.18 0.05 165) 100%)",
        }}
      >
        {/* decorative glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "oklch(0.72 0.18 35 / 0.45)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-20 h-[460px] w-[460px] rounded-full opacity-30 blur-3xl"
          style={{ background: "oklch(0.62 0.15 155 / 0.5)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Top: brand */}
        <div className="relative z-10">
          <BrandLogo
            variant="light"
            className="h-14 w-auto"
            alt="upCarrera — Learn. Grow. Succeed."
          />
          <div className="mt-3 text-xs text-white/70">
            Admission & Student Success Portal
          </div>
        </div>

        {/* Middle: greeting */}
        <div className="relative z-10 max-w-xl text-primary-foreground">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            {greeting}
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight xl:text-5xl">
            {message}
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">
            A secure workspace for admissions, counsellors, and operations
            teams to manage student journeys end-to-end.
          </p>

          <div className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {[
              { k: "12k+", v: "Applications" },
              { k: "180+", v: "Universities" },
              { k: "98%", v: "On-time SLAs" },
            ].map((s) => (
              <div
                key={s.v}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur"
              >
                <div className="text-lg font-semibold text-white">{s.k}</div>
                <div className="text-[11px] uppercase tracking-wide text-white/60">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: trust + footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-white/60">
          <div className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-white/70" />
            Encrypted · Role-based access · Audit logged
          </div>
          <div>© 2026 upCarrera Education</div>
        </div>
      </aside>

      {/* RIGHT PANEL */}
      <main className="flex min-h-screen flex-col">
        {/* mobile header */}
        <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
          <BrandLogo variant="color" className="h-7 w-auto" alt="upCarrera" />
          <span className="text-xs text-muted-foreground">{greeting}</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            {/* mobile greeting */}
            <div className="mb-6 lg:hidden">
              <h2 className="text-2xl font-semibold tracking-tight">{greeting}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-elevated)] sm:p-8">
              {screen === "login" && (
                <LoginForm
                  email={email}
                  password={password}
                  remember={remember}
                  showPwd={showPwd}
                  loading={loading}
                  onEmail={setEmail}
                  onPassword={setPassword}
                  onRemember={setRemember}
                  onTogglePwd={() => setShowPwd((v) => !v)}
                  onSubmit={handleLogin}
                  onForgot={() => setScreen("forgot")}
                />
              )}

              {screen === "forgot" && (
                <ForgotContact onBack={() => setScreen("login")} />
              )}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              © 2026 upCarrera Education. All rights reserved.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-xs font-medium text-foreground/80">{children}</Label>;
}

function PrimaryButton({
  children,
  loading,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <Button
      {...rest}
      disabled={loading || rest.disabled}
      className={cn(
        "h-11 w-full rounded-lg text-sm font-semibold shadow-sm transition-all",
        "bg-primary text-primary-foreground hover:bg-primary-hover",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        className,
      )}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Please wait…
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

function LoginForm(props: {
  email: string;
  password: string;
  remember: boolean;
  showPwd: boolean;
  loading: boolean;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onRemember: (v: boolean) => void;
  onTogglePwd: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: () => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Welcome Back</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Login to continue to your upCarrera workspace.
        </p>
      </div>

      <div className="space-y-2">
        <FieldLabel>Email Address / User ID</FieldLabel>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={props.email}
            onChange={(e) => props.onEmail(e.target.value)}
            placeholder="you@upcarrera.com"
            className="h-11 pl-9"
            autoComplete="username"
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel>Password</FieldLabel>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type={props.showPwd ? "text" : "password"}
            value={props.password}
            onChange={(e) => props.onPassword(e.target.value)}
            placeholder="Enter your password"
            className="h-11 pl-9 pr-10"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={props.onTogglePwd}
            aria-label={props.showPwd ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {props.showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
          <Checkbox
            checked={props.remember}
            onCheckedChange={(v) => props.onRemember(Boolean(v))}
          />
          Remember me
        </label>
        <button
          type="button"
          onClick={props.onForgot}
          className="text-sm font-medium text-primary hover:text-accent"
        >
          Forgot password?
        </button>
      </div>

      <PrimaryButton type="submit" loading={props.loading}>
        Login <ArrowRight className="h-4 w-4" />
      </PrimaryButton>

      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-center text-xs text-muted-foreground">
        Access is provided only by the system administrator.
      </div>
    </form>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Login
    </button>
  );
}

function ForgotContact({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Reset your password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          For security, staff passwords are reset by your administrator. Contact
          your system administrator and they&rsquo;ll set a new password for your
          account.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
        Already have your new password? Head back and sign in.
      </div>

      <div className="flex justify-center">
        <BackLink onClick={onBack} />
      </div>
    </div>
  );
}

/* avoid unused import warning when not referenced elsewhere */
void useEffect;
