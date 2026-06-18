import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/administration/")({
  head: () => ({ meta: [{ title: "Administration — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={Settings}
      title="Administration"
      description="Manage users, permissions, workflows, settings, and system configuration."
      highlights={["Users & Roles", "Permissions", "Workflows", "System Settings"]}
    />
  ),
});
