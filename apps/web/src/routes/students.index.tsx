import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/students/")({
  head: () => ({ meta: [{ title: "Student Management — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={GraduationCap}
      title="Student Management"
      description="Manage complete student lifecycle, profiles, documents, academic progress, and communication history."
      highlights={["360° Profiles", "Document Vault", "Academic Tracking", "Communication Log"]}
    />
  ),
});
