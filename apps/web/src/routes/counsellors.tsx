import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/counsellors")({
  component: () => <Outlet />,
});
