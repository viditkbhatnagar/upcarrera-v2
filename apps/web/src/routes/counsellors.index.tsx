import { createFileRoute } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/counsellors/")({
  head: () => ({ meta: [{ title: "Counsellor Management — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={Briefcase}
      title="Counsellor Management"
      description="Manage counsellors, teams, groups, and performance targets across the organization."
      highlights={["Counsellors", "Teams", "Groups", "Targets"]}
    />
  ),
});
