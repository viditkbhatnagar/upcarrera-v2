import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fees/")({
  beforeLoad: () => {
    throw redirect({ to: "/fees/dashboard" });
  },
});
