"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import { StatCard } from "@/components/Card";

/**
 * Each metric is read from a list endpoint with `?limit=1`, taking `data.total`.
 * This avoids transferring full pages just to count rows.
 */
interface Metric {
  key: string;
  label: string;
  path: string;
  accent: string;
}

const METRICS: Metric[] = [
  { key: "leads", label: "Leads", path: "/leads", accent: "text-accent" },
  { key: "students", label: "Students", path: "/students", accent: "text-indigo-500" },
  { key: "courses", label: "Courses", path: "/courses", accent: "text-emerald-500" },
  { key: "invoices", label: "Invoices", path: "/invoices", accent: "text-amber-500" },
  { key: "users", label: "Users", path: "/users", accent: "text-sky-500" },
];

type Counts = Record<string, number | null>;

export default function DashboardPage() {
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      setLoading(true);
      setError(null);

      // Fetch all totals in parallel; tolerate individual endpoint failures
      // (a not-yet-built endpoint shouldn't blank the whole dashboard).
      const results = await Promise.allSettled(
        METRICS.map((m) =>
          apiGet<Paginated<unknown>>(m.path, { page: 1, limit: 1 }),
        ),
      );

      if (cancelled) return;

      const next: Counts = {};
      let sawAuthError = false;

      results.forEach((res, i) => {
        const key = METRICS[i].key;
        if (res.status === "fulfilled") {
          next[key] = res.value.total ?? 0;
        } else {
          next[key] = null;
          if (res.reason instanceof ApiError && res.reason.statusCode === 401) {
            sawAuthError = true;
          }
        }
      });

      setCounts(next);
      if (sawAuthError) {
        setError("Your session has expired. Please sign in again.");
      }
      setLoading(false);
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A quick pulse on your pipeline and records."
      />

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {METRICS.map((m) => {
          const value = counts[m.key];
          return (
            <StatCard
              key={m.key}
              label={m.label}
              accent={m.accent}
              loading={loading}
              value={value === null ? "—" : (value ?? 0).toLocaleString()}
              hint={value === null ? "Unavailable" : "Total records"}
            />
          );
        })}
      </section>
    </div>
  );
}
