import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fee Management — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={Wallet}
      title="Fee Management"
      description="Manage fee plans, collections, installment tracking, receipts, and overdue follow-ups."
      highlights={["Fee Plans", "Installments", "Receipts", "Overdue Tracker"]}
    />
  ),
});
