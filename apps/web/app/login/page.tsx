"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import Button from "@/components/Button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      const from = searchParams.get("from");
      router.push(from && from !== "/login" ? from : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label
          htmlFor="username"
          className="text-sm font-medium text-ink-600"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-lg border border-ink/12 bg-white px-3.5 py-2.5 text-sm text-ink outline-none ring-accent/40 transition focus:border-accent focus:ring-2"
          placeholder="you@upcarrera.com"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-ink-600"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-ink/12 bg-white px-3.5 py-2.5 text-sm text-ink outline-none ring-accent/40 transition focus:border-accent focus:ring-2"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-accent/20 bg-accent-50 px-3.5 py-2.5 text-sm text-accent-600"
        >
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={submitting || !username || !password}
      >
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink bg-grid px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-lg font-bold text-white shadow-lg">
            uC
          </span>
          <span className="text-2xl font-semibold tracking-tight text-white">
            up<span className="text-accent">Carrera</span>
          </span>
        </div>

        <div className="rounded-2xl bg-surface p-8 shadow-2xl ring-1 ring-white/10">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              Staff Console
            </h1>
            <p className="mt-1 text-sm text-ink-400">
              Sign in to continue to your dashboard.
            </p>
          </div>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          Internal tool · authorized personnel only
        </p>
      </div>
    </main>
  );
}
