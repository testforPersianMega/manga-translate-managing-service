import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-vazir)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
