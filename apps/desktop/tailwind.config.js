/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        app: "rgb(var(--app-bg) / <alpha-value>)",
        chrome: "rgb(var(--chrome-bg) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar-bg) / <alpha-value>)",
        panel: "rgb(var(--panel-bg) / <alpha-value>)",
        panel2: "rgb(var(--panel-bg-2) / <alpha-value>)",
        hover: "rgb(var(--hover-bg) / <alpha-value>)",
        selected: "rgb(var(--selected-bg) / <alpha-value>)",
        border: "rgb(var(--border-color) / <alpha-value>)",
        muted: "rgb(var(--muted-text) / <alpha-value>)",
        muted2: "rgb(var(--muted-text-2) / <alpha-value>)",
        text: "rgb(var(--text-color) / <alpha-value>)",
        accent: "rgb(var(--accent-color) / <alpha-value>)",
        accentSoft: "rgb(var(--accent-soft) / <alpha-value>)",
        success: "rgb(var(--success-color) / <alpha-value>)",
        warn: "rgb(var(--warn-color) / <alpha-value>)",
        error: "rgb(var(--error-color) / <alpha-value>)",
      },
      boxShadow: {
        overlay: "0 18px 48px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.08)",
      },
      borderRadius: {
        app: "12px",
      },
      gridTemplateColumns: {
        app: "var(--sidebar-width, 240px) minmax(0, 1fr) var(--inspector-width, 300px)",
      },
    },
  },
  plugins: [],
};
