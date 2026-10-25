import { createFileRoute } from "@tanstack/react-router";
import { PlayCircle } from "lucide-react";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/training")({
  head: () => ({ meta: [{ title: "Training — upCarrera" }] }),
  component: TrainingPage,
});

function TrainingPage() {
  return (
    <ModulePlaceholder
      icon={PlayCircle}
      title="Training"
      description="Training videos and learning material to help you counsel and convert better."
    />
  );
}
