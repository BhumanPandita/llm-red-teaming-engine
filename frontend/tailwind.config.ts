import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        panel: "#13161d",
        panel2: "#1a1e27",
        border: "#242935",
        muted: "#6b7280",
        text: "#e5e7eb",
        accent: "#7c5cff",
        critical: "#ef4444",
        high: "#f97316",
        medium: "#eab308",
        low: "#3b82f6",
        none: "#10b981",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
