/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Semantic tokens mapped to CSS variables. Both the variable *names*
        // and their values are derived from src/ui/palette.ts — do not hand-
        // edit a colour here. Values are space-separated RGB so alpha
        // utilities work (e.g. bg-primary/10).
        background: "rgb(var(--oc-background) / <alpha-value>)",
        surface: "rgb(var(--oc-surface) / <alpha-value>)",
        "surface-hover": "rgb(var(--oc-surface-hover) / <alpha-value>)",
        elevated: "rgb(var(--oc-elevated) / <alpha-value>)",
        overlay: "rgb(var(--oc-overlay) / <alpha-value>)",
        border: "rgb(var(--oc-border) / <alpha-value>)",
        text: "rgb(var(--oc-text) / <alpha-value>)",
        "text-muted": "rgb(var(--oc-text-muted) / <alpha-value>)",
        "text-faint": "rgb(var(--oc-text-faint) / <alpha-value>)",
        primary: "rgb(var(--oc-primary) / <alpha-value>)",
        "primary-foreground": "rgb(var(--oc-primary-foreground) / <alpha-value>)",
        "user-bubble": "rgb(var(--oc-user-bubble) / <alpha-value>)",
        "user-bubble-text": "rgb(var(--oc-user-bubble-text) / <alpha-value>)",
        danger: "rgb(var(--oc-danger) / <alpha-value>)",
        success: "rgb(var(--oc-success) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
