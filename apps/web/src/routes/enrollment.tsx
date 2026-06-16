import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/enrollment")({
  head: () => ({ meta: [{ title: "Enrollment Management — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={ClipboardList}
      title="Enrollment Management"
      description="Track admission verification, enrollment processing, university submissions, and onboarding."
      highlights={["Verification", "University Submission", "Onboarding", "Status Tracking"]}
    />
  ),
});
