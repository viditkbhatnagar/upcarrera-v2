import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments — upCarrera" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <ModulePlaceholder
      icon={CreditCard}
      title="Payments"
      description="Track and collect your applicants' registration and course fee payments in one place."
    />
  );
}
