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
          bg: "#FAF8F5",
          canvas: "#F2EFE9",
          paper: "#FFFFFF",
          ink: "#111111",
          muted: "#66645E",
          border: "#E2DFD7",
          vermilion: "#E54B4B",
          "vermilion-hover": "#D9381E",
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
