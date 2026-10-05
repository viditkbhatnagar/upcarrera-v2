import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  ShieldCheck,
  Search,
  Loader2,
  AlertTriangle,
  Eye,
  CheckCircle2,
  XCircle,
  Receipt,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api";
import {
  listApplicationPayments,
  applicationKeys,
  formatINR,
  type PaidToCode,
  type PaymentModeCode,
  type QueuePayment,
} from "@/lib/api/applications";
import {
  PAID_TO_LABEL,
  PAYMENT_MODE_LABEL,
  PAYMENT_STATUS_BADGE,
  PAID_TO_OPTIONS,
  PAYMENT_MODE_OPTIONS,
} from "@/components/applications/stage-model";
import {
  VerifyPaymentDialog,
  MismatchDialog,
  ProofPreview,
} from "@/components/applications/payment-dialogs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const ALL = "all";

const searchSchema = z.object({
  status: fallback(z.enum(["pending", "verified", "mismatch"]), "pending").default("pending"),
  page: fallback(z.coerce.number().int().min(1).optional(), undefined),
});

export const Route = createFileRoute("/fees/registration-verification")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Registration Fees — upCarrera" },
      {
        name: "description",
        content: "Accounts verification queue for pre-conversion registration-fee entries.",
      },
    ],
  }),
  component: RegistrationVerification,
});

type QueueTab = "pending" | "verified" | "mismatch";

const TABS: { value: QueueTab; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "mismatch", label: "Mismatch" },
];

function RegistrationVerification() {
  const { status, page: pageParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const page = pageParam ?? 1;

  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paidTo, setPaidTo] = useState<string>(ALL);
  const [mode, setMode] = useState<string>(ALL);

  const [verify, setVerify] = useState<QueuePayment | null>(null);
  const [mismatch, setMismatch] = useState<QueuePayment | null>(null);
  const [proof, setProof] = useState<QueuePayment | null>(null);

  // Debounce the search so typing fires one request on pause, not one per keystroke.
  const debouncedQuery = useDebouncedValue(query);

  const goToPage = (p: number) =>
    navigate({ search: (prev) => ({ ...prev, page: p <= 1 ? undefined : p }) });
  // Any filter change returns to page 1 so the user never lands past the last page.
  const resetPage = () => navigate({ search: (prev) => ({ ...prev, page: undefined }) });

  // Reset to page 1 when the debounced search settles on a new value (not on mount).
  const prevSearch = useRef(debouncedQuery);
  useEffect(() => {
    if (prevSearch.current !== debouncedQuery) {
      prevSearch.current = debouncedQuery;
      navigate({ search: (prev) => ({ ...prev, page: undefined }) });
    }
  }, [debouncedQuery, navigate]);

  const params = useMemo(
    () => ({
      status,
      page,
      limit: PAGE_SIZE,
      ...(debouncedQuery.trim() ? { search: debouncedQuery.trim() } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(paidTo !== ALL ? { paid_to: paidTo as PaidToCode } : {}),
      ...(mode !== ALL ? { payment_mode: mode as PaymentModeCode } : {}),
    }),
    [status, page, debouncedQuery, dateFrom, dateTo, paidTo, mode],
  );

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: [...applicationKeys.queue, params],
    queryFn: () => listApplicationPayments(params),
    placeholderData: (prev) => prev,
  });

  const rows = data?.items ?? [];
  const apiTotal = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const invalidate = () => qc.invalidateQueries({ queryKey: applicationKeys.queue });

  const setTab = (value: QueueTab) => navigate({ search: () => ({ status: value }) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fee Management
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <ShieldCheck className="h-6 w-6 text-primary" /> Registration fees
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify pre-conversion registration-fee entries recorded by counsellors.
          </p>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={status} onValueChange={(v) => setTab(v as QueueTab)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, phone, app ID or txn ref"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-72 pl-8"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rf-from">Paid from</Label>
            <Input
              id="rf-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-to">Paid to (date)</Label>
            <Input
              id="rf-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Paid to</Label>
            <Select
              value={paidTo}
              onValueChange={(v) => {
                setPaidTo(v);
                resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {PAID_TO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                setMode(v);
                resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {PAYMENT_MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} ${status} entries`}
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <QueueState>
              <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading…</div>
            </QueueState>
          ) : isError ? (
            <QueueState>
              <AlertTriangle className="h-10 w-10 text-destructive/70" />
              <div className="text-sm font-semibold text-foreground">Couldn't load the queue</div>
              <div className="text-xs text-muted-foreground">
                {error instanceof ApiError ? error.message : "Please try again."}
              </div>
            </QueueState>
          ) : rows.length === 0 ? (
            <QueueState>
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Receipt className="h-7 w-7" />
              </div>
              <div className="text-sm font-semibold text-foreground">Nothing here</div>
              <div className="text-xs text-muted-foreground">No {status} registration-fee entries.</div>
            </QueueState>
          ) : (
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">App ID</th>
                  <th className="px-3 py-3">Applicant</th>
                  <th className="px-3 py-3">Counsellor</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3">Paid to</th>
                  <th className="px-3 py-3">Mode</th>
                  <th className="px-3 py-3">Txn ref</th>
                  <th className="px-3 py-3">Paid on</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-border transition hover:bg-muted/40">
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-primary">{p.display_id}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-foreground">{p.applicant_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{p.applicant_phone ?? "—"}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground">{p.consultant_name ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">
                      {formatINR(p.amount)}
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground">
                      {PAID_TO_LABEL[p.paid_to ?? ""] ?? p.paid_to ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground">
                      {PAYMENT_MODE_LABEL[p.payment_mode ?? ""] ?? p.payment_mode ?? "—"}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-foreground">{p.txn_ref ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {p.paid_on ? new Date(p.paid_on).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setProof(p)}>
                          <Eye className="h-4 w-4" /> Proof
                        </Button>
                        {p.status === "pending" && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => setMismatch(p)}>
                              <XCircle className="h-4 w-4" /> Mismatch
                            </Button>
                            <Button size="sm" onClick={() => setVerify(p)}>
                              <CheckCircle2 className="h-4 w-4" /> Verify
                            </Button>
                          </>
                        )}
                        {p.status !== "pending" && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                              PAYMENT_STATUS_BADGE[p.status],
                            )}
                          >
                            {p.status === "verified" ? "Verified" : "Mismatch"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!isLoading && !isError && apiTotal > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-semibold text-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}
              </span>
              –
              <span className="font-semibold text-foreground">
                {Math.min(currentPage * PAGE_SIZE, apiTotal)}
              </span>{" "}
              of <span className="font-semibold text-foreground">{apiTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-semibold text-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <VerifyPaymentDialog
        paymentId={verify?.id ?? null}
        open={!!verify}
        onOpenChange={(o) => !o && setVerify(null)}
        onSuccess={invalidate}
      />
      <MismatchDialog
        paymentId={mismatch?.id ?? null}
        open={!!mismatch}
        onOpenChange={(o) => !o && setMismatch(null)}
        onSuccess={invalidate}
      />
      <Dialog open={!!proof} onOpenChange={(o) => !o && setProof(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment proof — {proof?.display_id}</DialogTitle>
          </DialogHeader>
          {proof && (
            <ProofPreview
              paymentId={proof.id}
              mime={proof.proof_mime}
              fileName={proof.proof_original_name}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">{children}</div>
  );
}
