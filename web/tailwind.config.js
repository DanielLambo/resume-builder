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
        /** Dark IDE chrome — warm charcoal + brand vermilion (matches site). */
        ide: {
          /** Code editor surface */
          bg: "#252220",
          /** Toolbars, header */
          panel: "#2e2928",
          /** Chips, inputs, AI dock */
          raised: "#3a3432",
          hover: "#46403d",
          /** Separators */
          border: "#5c534e",
          /** Preview canvas around the white page */
          gutter: "#1a1716",
          ink: "#f3f0ec",
          muted: "#b5aea6",
          faint: "#8a827a",
          /** Same vermilion as marketing / studio CTAs */
          accent: "#E54B4B",
          "accent-hover": "#D9381E",
          "accent-muted": "#b53a3a",
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
