import { createFileRoute } from "@tanstack/react-router";
import { CounsellorPayments } from "@/components/counsellor/screens/payments";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payment Tracking — upCarrera" },
      { name: "description", content: "Track collections, pending fees and overdue payments." },
    ],
  }),
  component: CounsellorPayments,
});
