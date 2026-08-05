/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // Default to light mode (no `dark` class on <html>)
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#fbfbfa",
          canvas: "#f4f3f1",
          paper: "#FFFFFF",
          ink: "#1a1a1a",
          muted: "#5c5852",
          border: "#e7e4dc",
          vermilion: "#E54B4B",
          "vermilion-hover": "#D9381E",
          amber: "#d97706",
        },
        /** Overleaf-style dark IDE chrome (editor shell only). */
        ide: {
          bg: "#1a1d23",
          panel: "#16181c",
          raised: "#22262e",
          hover: "#2a2f38",
          border: "#2e333c",
          gutter: "#12141a",
          ink: "#e6e8ec",
          muted: "#8b919c",
          faint: "#5c6370",
          accent: "#4caf50",
          "accent-hover": "#43a047",
          "accent-muted": "#2e7d32",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Geist", "Inter", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Geist Mono", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "paper-sheet":
          "0 8px 30px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
        "floating-bar": "0 4px 20px rgba(0, 0, 0, 0.05)",
      },
    },
  },
  plugins: [],
};
