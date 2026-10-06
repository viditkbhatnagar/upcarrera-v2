import { createFileRoute } from "@tanstack/react-router";
import { FeeStructureForm } from "@/components/fee-structure/FeeStructureForm";

export const Route = createFileRoute("/universities/fee-structure_/new")({
  head: () => ({ meta: [{ title: "New fee structure — upCarrera" }] }),
  component: NewFeeStructurePage,
});

function NewFeeStructurePage() {
  return <FeeStructureForm mode="create" />;
}
