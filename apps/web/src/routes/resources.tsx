import { createFileRoute } from "@tanstack/react-router";
import { CounsellorResources } from "@/components/counsellor/screens/resources";

export const Route = createFileRoute("/resources")({
  head: () => ({
    meta: [
      { title: "Resources — upCarrera" },
      { name: "description", content: "Browse counsellor resources organized by folder." },
    ],
  }),
  component: CounsellorResources,
});
