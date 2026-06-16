import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={BarChart3}
      title="Reports"
      description="Access operational, financial, admission, support, and management reports."
      highlights={["Operational", "Financial", "Admissions", "Management"]}
    />
  ),
});
