import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  GraduationCap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

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

type Screen = "login" | "forgot-email" | "forgot-otp" | "forgot-reset" | "forgot-success";

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
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("login");

  // login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // forgot state
  const [resetEmail, setResetEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);

  const [{ greeting, message }, setGreeting] = useState({
    greeting: "Welcome",
    message: "Login to continue to your upCarrera workspace.",
  });

  useEffect(() => {
    setGreeting(getGreeting(new Date()));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setLoading(false);
    toast.success("Welcome back to upCarrera.");
    navigate({ to: "/dashboard" });
  };


  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error("Please enter your registered email.");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    toast.success("OTP sent to your registered email.");
    setScreen("forgot-otp");
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit OTP.");
      return;
    }
    setScreen("forgot-reset");
  };

  const handleResetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    setScreen("forgot-success");
  };

  const backToLogin = () => {
    setScreen("login");
    setResetEmail("");
    setOtp("");
    setNewPwd("");
    setConfirmPwd("");
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
        <div className="relative z-10 flex items-center gap-3 text-primary-foreground">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">upCarrera Education</div>
            <div className="text-xs text-white/70">Admission & Student Success Portal</div>
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
          <div className="flex items-center gap-2">
            <div
              className="grid h-9 w-9 place-items-center rounded-lg text-primary-foreground"
              style={{ background: "var(--color-primary)" }}
            >
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold">upCarrera</div>
          </div>
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
                  onForgot={() => setScreen("forgot-email")}
                />
              )}

              {screen === "forgot-email" && (
                <ForgotEmail
                  email={resetEmail}
                  loading={loading}
                  onEmail={setResetEmail}
                  onSubmit={handleSendOtp}
                  onBack={backToLogin}
                />
              )}

              {screen === "forgot-otp" && (
                <ForgotOtp
                  email={resetEmail}
                  otp={otp}
                  onOtp={setOtp}
                  onSubmit={handleVerifyOtp}
                  onBack={() => setScreen("forgot-email")}
                  onResend={() => toast.success("A new OTP has been sent.")}
                />
              )}

              {screen === "forgot-reset" && (
                <ForgotReset
                  newPwd={newPwd}
                  confirmPwd={confirmPwd}
                  showPwd={showNewPwd}
                  loading={loading}
                  onNewPwd={setNewPwd}
                  onConfirmPwd={setConfirmPwd}
                  onTogglePwd={() => setShowNewPwd((v) => !v)}
                  onSubmit={handleResetPwd}
                  onBack={() => setScreen("forgot-otp")}
                />
              )}

              {screen === "forgot-success" && (
                <ForgotSuccess onBack={backToLogin} />
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

function ForgotEmail(props: {
  email: string;
  loading: boolean;
  onEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Reset Password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter your registered email address and we will send an OTP.
        </p>
      </div>

      <div className="space-y-2">
        <FieldLabel>Registered Email Address</FieldLabel>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            value={props.email}
            onChange={(e) => props.onEmail(e.target.value)}
            placeholder="you@upcarrera.com"
            className="h-11 pl-9"
            required
          />
        </div>
      </div>

      <PrimaryButton type="submit" loading={props.loading}>
        Get OTP
      </PrimaryButton>

      <div className="flex justify-center">
        <BackLink onClick={props.onBack} />
      </div>
    </form>
  );
}

function ForgotOtp(props: {
  email: string;
  otp: string;
  onOtp: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  onResend: () => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Enter OTP</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-foreground">{props.email || "your email"}</span>.
        </p>
      </div>

      <div className="flex justify-center py-2">
        <InputOTP maxLength={6} value={props.otp} onChange={props.onOtp}>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-12 text-base" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <PrimaryButton type="submit">Verify OTP</PrimaryButton>

      <div className="flex items-center justify-between">
        <BackLink onClick={props.onBack} />
        <button
          type="button"
          onClick={props.onResend}
          className="text-sm font-medium text-primary hover:text-accent"
        >
          Resend OTP
        </button>
      </div>
    </form>
  );
}

function ForgotReset(props: {
  newPwd: string;
  confirmPwd: string;
  showPwd: boolean;
  loading: boolean;
  onNewPwd: (v: string) => void;
  onConfirmPwd: (v: string) => void;
  onTogglePwd: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Set New Password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choose a strong password you haven't used before.
        </p>
      </div>

      <div className="space-y-2">
        <FieldLabel>New Password</FieldLabel>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type={props.showPwd ? "text" : "password"}
            value={props.newPwd}
            onChange={(e) => props.onNewPwd(e.target.value)}
            placeholder="At least 8 characters"
            className="h-11 pl-9 pr-10"
            required
          />
          <button
            type="button"
            onClick={props.onTogglePwd}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            {props.showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel>Confirm Password</FieldLabel>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type={props.showPwd ? "text" : "password"}
            value={props.confirmPwd}
            onChange={(e) => props.onConfirmPwd(e.target.value)}
            placeholder="Re-enter new password"
            className="h-11 pl-9"
            required
          />
        </div>
      </div>

      <PrimaryButton type="submit" loading={props.loading}>
        Update Password
      </PrimaryButton>

      <div className="flex justify-center">
        <BackLink onClick={props.onBack} />
      </div>
    </form>
  );
}

function ForgotSuccess({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Password Updated</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your password has been successfully updated. You can now login with
          your new password.
        </p>
      </div>
      <PrimaryButton type="button" onClick={onBack}>
        Back to Login
      </PrimaryButton>
      <p className="text-xs text-muted-foreground">
        Please contact your system administrator if you do not receive the email.
      </p>
    </div>
  );
}

/* avoid unused import warning when not referenced elsewhere */
void useEffect;
