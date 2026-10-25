import { createFileRoute } from "@tanstack/react-router";
import { CounsellorTraining } from "@/components/counsellor/screens/training";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Training Center — upCarrera" },
      { name: "description", content: "Counsellor video training, courses, and certifications." },
    ],
  }),
  component: CounsellorTraining,
});
