import { createFileRoute } from "@tanstack/react-router";
import { Headphones } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Student Support — upCarrera" }] }),
  component: () => (
    <ModulePlaceholder
      icon={Headphones}
      title="Student Support"
      description="Manage support tickets, student services, escalations, and academic assistance."
      highlights={["Tickets", "Escalations", "Services", "Knowledge Base"]}
    />
  ),
});
