import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dot:    { pink: "#111111", light: "#333333" },
        bg:     { base: "#F5F4F0", surface: "#FAF9F7", card: "#FFFFFF" },
        border: { DEFAULT: "rgba(0,0,0,0.07)", subtle: "rgba(0,0,0,0.04)" },
        brand:  { blue: "#2563eb", pink: "#111111", yellow: "#F5F4F0" },
      },
      fontFamily: {
        sans: ["var(--font-ibm-plex-sans)", "IBM Plex Sans", "Inter", "system-ui", "sans-serif"],
        pixel: ["var(--font-courier-prime)", "Courier Prime", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
