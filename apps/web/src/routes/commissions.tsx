import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/commissions")({
  head: () => ({ meta: [{ title: "Commission Management — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={TrendingUp}
      title="Commission Management"
      description="Track commissions, receivables, university payouts, settlements, and financial analytics."
      highlights={["Receivables", "Payouts", "Settlements", "Analytics"]}
    />
  ),
});
