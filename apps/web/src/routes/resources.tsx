import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/resources")({
  head: () => ({ meta: [{ title: "Resources — upCarrera" }] }),
  component: ResourcesPage,
});

function ResourcesPage() {
  return (
    <ModulePlaceholder
      icon={FolderOpen}
      title="Resources"
      description="Brochures, fee sheets and course collateral you can share with prospective students."
    />
  );
}
