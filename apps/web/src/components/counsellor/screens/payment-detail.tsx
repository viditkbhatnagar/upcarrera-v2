import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  IndianRupee,
  Mail,
  Phone,
  Receipt as ReceiptIcon,
  RefreshCcw,
  SearchX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatePanel } from "@/components/counsellor/shared/info";
import { Paginated } from "@/components/counsellor/shared/paginated";
import { SortHead, useSort } from "@/components/counsellor/shared/sortable-head";
import {
  EMPTY,
  formatINR,
  fmtDay,
  initialsOf,
  installmentStatusStyles,
  paidPercent,
  paymentStatusStyles,
  type PaymentDetailData,
  type PaymentInstallment,
  type PaymentReceipt,
} from "./payments-model";

/** Payment detail (Naji's design), from GET /payments/:id (scoped to the counsellor's students). */
export function CounsellorPaymentDetail({ idParam }: { idParam: string }) {
  const id = /^\d+$/.test(idParam) ? Number(idParam) : null;
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["counsellor", "payment", id],
    queryFn: () => apiGet<PaymentDetailData>(`/payments/${id}`),
    enabled: id != null,
  });

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/payments"><ArrowLeft className="h-4 w-4 mr-1" /> All payments</Link>
        </Button>
      </div>

      {id == null || (isError && error instanceof ApiError && error.status === 404) ? (
        <StatePanel
          icon={<SearchX className="h-7 w-7 text-muted-foreground/70" />}
          title="Payment record not found"
          hint="The student may not be one of yours, or the link is incorrect."
        />
      ) : isLoading ? (
        <StatePanel icon={<RefreshCcw className="h-7 w-7 animate-spin text-muted-foreground/60" />} title="Loading payments…" />
      ) : isError || !data ? (
        <StatePanel
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          title="Couldn't load this payment record"
          hint={error instanceof Error ? error.message : "Please try again."}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : (
        <PaymentContent p={data} />
      )}
    </>
  );
}

function PaymentContent({ p }: { p: PaymentDetailData }) {
  const outstanding = p.due + p.pending;
  const pct = paidPercent(p.paid, p.total);
  const installments = useSort(p.installments, {
    label: (i) => i.label,
    due: (i) => i.dueDate,
    amount: (i) => i.amount,
    status: (i) => i.status,
  });
  const unpaid = p.installments.filter((i) => i.status !== "Paid");
  const pendingInst = useSort(unpaid, {
    label: (i) => i.label,
    due: (i) => i.dueDate,
    amount: (i) => i.amount - i.paidAmount,
    status: (i) => i.status,
  });
  const receipts = useSort(p.receipts, {
    date: (r) => r.date,
    id: (r) => r.paymentId,
    mode: (r) => r.mode,
    ref: (r) => r.reference,
    amount: (r) => r.amount,
  });

  return (
    <>
      <Card className="p-5 lg:p-6 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-primary-soft text-accent-foreground font-semibold">{initialsOf(p.name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                <Link to="/students/students/$id" params={{ id: String(p.id) }} className="hover:underline">{p.name ?? EMPTY}</Link>
              </h1>
              <Badge variant="outline" className={cn("rounded-full", paymentStatusStyles[p.status])}>{p.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {p.student_ref} · {p.course ?? EMPTY}
              {p.university ? ` · ${p.university}` : ""}
              {p.intake ? ` · ${p.intake}` : ""}
            </p>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {p.email ?? EMPTY}</span>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {p.phone ?? EMPTY}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <Stat label="Total Fee" value={p.total > 0 ? formatINR(p.total) : EMPTY} tone="info" icon={Wallet} />
          <Stat label="Paid" value={formatINR(p.paid)} tone="success" icon={IndianRupee} />
          <Stat label="Pending" value={formatINR(outstanding)} tone={outstanding > 0 ? "warning" : "muted"} icon={IndianRupee} />
          <Stat label="Next Due" value={p.nextDueDate ? fmtDay(p.nextDueDate) : EMPTY} tone="primary" icon={ReceiptIcon} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Fee Collected</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="structure" className="space-y-4">
        <TabsList>
          <TabsTrigger value="structure">Fee Structure</TabsTrigger>
          <TabsTrigger value="history">Payment History</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="pending">Pending Installments</TabsTrigger>
        </TabsList>

        <TabsContent value="structure">
          <Card className="overflow-hidden shadow-[var(--shadow-soft)] border-border/70">
            <PanelHead title="Fee Structure" sub="Installment-wise breakdown" />
            {p.installments.length === 0 ? (
              <Empty text="No installments or invoices on file for this student." />
            ) : (
              <InstallmentTable sort={installments} withIndex />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-hidden shadow-[var(--shadow-soft)] border-border/70">
            <PanelHead title="Payment History" sub="Chronological transactions" />
            {p.receipts.length === 0 ? (
              <Empty text="No payments recorded yet." />
            ) : (
              <Paginated items={receipts.sorted} pageSize={5}>
                {(rows) => (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <SortHead k="date" s={receipts.sort}>Date</SortHead>
                        <SortHead k="id" s={receipts.sort}>Payment ID</SortHead>
                        <SortHead k="mode" s={receipts.sort}>Mode</SortHead>
                        <SortHead k="ref" s={receipts.sort}>Reference</SortHead>
                        <SortHead k="amount" s={receipts.sort} className="text-right">Amount</SortHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.key}>
                          <TableCell className="text-sm">{fmtDay(r.date)}</TableCell>
                          <TableCell className="font-medium">{r.paymentId}</TableCell>
                          <TableCell>
                            {r.mode ? <Badge variant="outline" className="rounded-full">{r.mode}</Badge> : <span className="text-muted-foreground">{EMPTY}</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.reference ?? EMPTY}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-success">{formatINR(r.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paginated>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="receipts">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {p.receipts.map((r) => <ReceiptCard key={r.key} r={r} />)}
            {p.receipts.length === 0 && (
              <Card className="p-10 col-span-full text-center text-sm text-muted-foreground">No receipts available.</Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <Card className="overflow-hidden shadow-[var(--shadow-soft)] border-border/70">
            <PanelHead title="Pending Installments" sub="Outstanding amounts and due dates" />
            {unpaid.length === 0 ? (
              <Empty text="All installments cleared." />
            ) : (
              <InstallmentTable sort={pendingInst} remaining />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function InstallmentTable({
  sort,
  withIndex,
  remaining,
}: {
  sort: ReturnType<typeof useSort<PaymentInstallment>>;
  withIndex?: boolean;
  /** Show the unpaid remainder instead of the full amount. */
  remaining?: boolean;
}) {
  return (
    <Paginated items={sort.sorted} pageSize={5}>
      {(rows, offset) => (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {withIndex && <TableHead>#</TableHead>}
              <SortHead k="label" s={sort.sort}>Installment</SortHead>
              <SortHead k="due" s={sort.sort}>Due Date</SortHead>
              <SortHead k="amount" s={sort.sort} className="text-right">{remaining ? "Outstanding" : "Amount"}</SortHead>
              <SortHead k="status" s={sort.sort}>Status</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i, idx) => (
              <TableRow key={i.key}>
                {withIndex && <TableCell className="text-muted-foreground">{offset + idx + 1}</TableCell>}
                <TableCell className="font-medium">{i.label}</TableCell>
                <TableCell className="text-sm">{fmtDay(i.dueDate)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatINR(remaining ? i.amount - i.paidAmount : i.amount)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("rounded-full", installmentStatusStyles[i.status])}>{i.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Paginated>
  );
}

function ReceiptCard({ r }: { r: PaymentReceipt }) {
  return (
    <Card className="p-5 shadow-[var(--shadow-soft)] border-border/70 hover:shadow-[var(--shadow-card)] transition-shadow">
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-lg bg-success-soft text-success flex items-center justify-center">
          <ReceiptIcon className="h-5 w-5" />
        </div>
        {r.mode && <Badge variant="outline" className="rounded-full">{r.mode}</Badge>}
      </div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mt-4">{r.paymentId}</p>
      <p className="text-xl font-bold mt-1 tabular-nums">{formatINR(r.amount)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {fmtDay(r.date, "long")}
        {r.reference ? ` · Ref ${r.reference}` : ""}
      </p>
    </Card>
  );
}

function PanelHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-5 py-3 border-b border-border">
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted-foreground">{text}</div>;
}

const STAT_TONES = {
  primary: "bg-primary-soft text-accent-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning-foreground",
  info: "bg-info-soft text-info",
  muted: "bg-muted text-muted-foreground",
} as const;

function Stat({ label, value, tone, icon: Icon }: { label: string; value: string; tone: keyof typeof STAT_TONES; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-border/70 p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-md flex items-center justify-center", STAT_TONES[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
