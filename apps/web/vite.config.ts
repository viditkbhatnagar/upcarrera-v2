import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Plain Vite SPA (ejected from TanStack Start / Lovable's build wrapper).
// TanStackRouterVite must run before the React plugin so generated routes are
// transformed. Served on :3001 to match the monorepo + deploy config.
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: { port: 3001, host: true },
  preview: { port: 3001, host: true },
});
