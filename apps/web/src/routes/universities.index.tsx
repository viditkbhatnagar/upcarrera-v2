import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/universities/")({
  head: () => ({ meta: [{ title: "University Master — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={Building2}
      title="University Master"
      description="Configure universities, courses, intakes, and fee structures."
      highlights={["Universities", "Courses", "Intakes", "Fee Structures"]}
    />
  ),
});
