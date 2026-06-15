import type { Config } from "tailwindcss";

/**
 * upCarrera staff console design tokens.
 * Palette: deep indigo "ink" sidebar + a warm coral accent, on a soft slate canvas.
 * Intentionally not the default Tailwind blue-on-white look.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#171734",
          800: "#1e1e44",
          700: "#272754",
          600: "#34346b",
          400: "#7a7aad",
        },
        accent: {
          DEFAULT: "#ff5a5f",
          600: "#e84a4f",
          50: "#fff1f1",
        },
        canvas: "#f5f6fb",
        surface: "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,23,52,0.04), 0 8px 24px -12px rgba(23,23,52,0.12)",
        "card-hover":
          "0 2px 4px rgba(23,23,52,0.06), 0 16px 40px -16px rgba(23,23,52,0.20)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
    },
  },
  plugins: [],
};

export default config;
