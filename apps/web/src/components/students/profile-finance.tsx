// Finance tab of the student profile (QA ST01).
//
// The profile used to read only invoice + payment, which almost no student has,
// so it said "No finance records" even for students with a paid Registration
// Fee. The API now also returns the student_payments fee ledger (where the
// legacy CRM and the convert step record installments) and the course fee for
// the student's specialisation. This tab shows all of it, and says which figure
// the Total is based on.

import { CheckCircle2, Clock, CreditCard, GraduationCap, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiFinance, ApiInstallment } from "./profile-types";
import {
  EmptyInline,
  EmptyTab,
  FinStat,
  InfoRow,
  SectionCard,
  formatDate,
  formatINR,
} from "./profile-ui";

const BASIS_TEXT: Record<ApiFinance["total_basis"], string> = {
  invoices: "Total is the sum of the student's invoices (they bill the course, so the course fee is not added on top).",
  course_fee: "No invoice is raised yet, so Total is the course fee for the student's specialisation.",
  installments: "No invoice or course fee is on file, so Total is the sum of the scheduled installments.",
  none: "No fee, installment or invoice is on file for this student.",
};

export function hasFinanceRecords(finance: ApiFinance | null): finance is ApiFinance {
  return (
    finance != null &&
    (finance.installment_count > 0 ||
      finance.invoice_count > 0 ||
      finance.payment_count > 0 ||
      finance.course_fee.amount != null)
  );
}

export function FinanceTab({ finance }: { finance: ApiFinance | null }) {
  if (!hasFinanceRecords(finance)) {
    return (
      <div className="space-y-4">
        <FinanceStats finance={finance} />
        <EmptyTab
          icon={Wallet}
          title="No finance records"
          description="No course fee, fee installment, invoice or payment is on file for this student."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FinanceStats finance={finance} />
      <p className="text-xs text-muted-foreground">{BASIS_TEXT[finance.total_basis]}</p>

      {finance.course_fee.amount != null && <CourseFeeCard finance={finance} />}

      <SectionCard title="Fee Installments" icon={Receipt}>
        {finance.installments.length === 0 ? (
          <EmptyInline label="No installments recorded." />
        ) : (
          <InstallmentsTable rows={finance.installments} />
        )}
      </SectionCard>

      {(finance.invoice_count > 0 || finance.payment_count > 0) && (
        <InvoicesCard finance={finance} />
      )}
    </div>
  );
}

function FinanceStats({ finance }: { finance: ApiFinance | null }) {
  const total = finance?.total ?? 0;
  const paid = finance?.paid ?? 0;
  const outstanding = finance?.outstanding ?? 0;
  const collection = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <FinStat label="Total Fee" value={formatINR(total)} tone="text-foreground" />
      <FinStat label="Paid" value={formatINR(paid)} tone="text-emerald-600" />
      <FinStat label="Outstanding" value={formatINR(outstanding)} tone="text-orange-600" />
      <FinStat
        label="Installments"
        value={String(finance?.installment_count ?? 0)}
        tone="text-foreground"
      />
      <FinStat label="Collection" value={total > 0 ? `${collection}%` : "—"} tone="text-primary" />
    </div>
  );
}

function CourseFeeCard({ finance }: { finance: ApiFinance }) {
  const fee = finance.course_fee;
  return (
    <SectionCard title="Course Fee" icon={GraduationCap}>
      <InfoRow label="Fee that applies" value={formatINR(fee.amount)} />
      {fee.special_fee != null && (
        <>
          <InfoRow
            label="Standard fee"
            value={fee.standard_amount != null ? formatINR(fee.standard_amount) : "—"}
          />
          <InfoRow label="Special fee reason" value={fee.special_reason?.trim() || "—"} />
        </>
      )}
      <InfoRow label="Paid against installments" value={formatINR(finance.installments_paid)} />
    </SectionCard>
  );
}

function InstallmentsTable({ rows }: { rows: ApiInstallment[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 font-semibold">Installment</th>
            <th className="py-2 font-semibold">Amount</th>
            <th className="py-2 font-semibold">Due</th>
            <th className="py-2 font-semibold">Paid on</th>
            <th className="py-2 font-semibold">Mode</th>
            <th className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.student_payment_id} className="border-b border-border/60 last:border-0">
              <td className="py-2.5 font-medium text-foreground">
                {r.installment_details?.trim() || "Installment"}
              </td>
              <td className="py-2.5 font-semibold">{formatINR(r.amount)}</td>
              <td className="py-2.5">{formatDate(r.due_date)}</td>
              <td className="py-2.5">{formatDate(r.paid_date)}</td>
              <td className="py-2.5 text-muted-foreground">
                {[r.payment_mode, r.payment_to].filter((v) => v && v.trim()).join(" · ") || "—"}
              </td>
              <td className="py-2.5">
                <StatusBadge paid={r.is_paid} label={r.status?.trim() || (r.is_paid ? "Paid" : "Pending")} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesCard({ finance }: { finance: ApiFinance }) {
  return (
    <SectionCard title="Invoices" icon={CreditCard}>
      {finance.invoices.length === 0 ? (
        <EmptyInline label="No invoices issued." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 font-semibold">Invoice</th>
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Due</th>
                <th className="py-2 font-semibold">Payable</th>
                <th className="py-2 font-semibold">Paid</th>
                <th className="py-2 font-semibold">Outstanding</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {finance.invoices.map((inv) => {
                const label =
                  inv.payment_status?.trim() || (inv.outstanding_amount <= 0 ? "paid" : "pending");
                return (
                  <tr key={inv.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 font-mono text-xs">#{inv.id}</td>
                    <td className="py-2.5">{formatDate(inv.date)}</td>
                    <td className="py-2.5">{formatDate(inv.due_date)}</td>
                    <td className="py-2.5 font-semibold">{formatINR(inv.payable_amount)}</td>
                    <td className="py-2.5 text-emerald-600">{formatINR(inv.paid_amount_total)}</td>
                    <td className="py-2.5 text-orange-600">{formatINR(inv.outstanding_amount)}</td>
                    <td className="py-2.5">
                      <StatusBadge
                        paid={label.toLowerCase() === "paid" || inv.outstanding_amount <= 0}
                        label={label}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {finance.payments.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payments against invoices
          </div>
          {finance.payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {formatINR(p.paid_amount)}
                  {p.payment_type && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      via {p.payment_type}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(p.payment_date)}
                  {p.reference_no ? ` · Ref ${p.reference_no}` : ""}
                  {p.invoice_id != null ? ` · Invoice #${p.invoice_id}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function StatusBadge({ paid, label }: { paid: boolean; label: string }) {
  const Icon = paid ? CheckCircle2 : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
        paid
          ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
          : "bg-orange-100 text-orange-700 ring-orange-200",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
