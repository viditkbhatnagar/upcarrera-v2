import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "./login";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Login — upCarrera Admission & Student Success Portal" },
      { name: "description", content: "Secure admin login for the upCarrera Education Admission & Student Success Portal." },
    ],
  }),
  component: LoginPage,
});
