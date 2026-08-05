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
          /** Code editor surface */
          bg: "#222831",
          /** Toolbars, header, AI dock */
          panel: "#2a313c",
          /** Chips, inputs, elevated controls */
          raised: "#353d4a",
          hover: "#414b5a",
          /** Separators — stronger so panes read as distinct */
          border: "#4d5666",
          /** Preview canvas around the white page */
          gutter: "#181c24",
          ink: "#f1f3f6",
          muted: "#aeb6c2",
          faint: "#808a99",
          accent: "#5cbf60",
          "accent-hover": "#4caf50",
          "accent-muted": "#3d8b40",
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
