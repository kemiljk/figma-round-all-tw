/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        figma: {
          primary: "var(--figma-color-text)",
          secondary: "var(--figma-color-text-secondary)",
          blue: "var(--figma-color-bg-brand)",
          hoverBlue: "var(--figma-color-bg-brand-hover)",
          secondaryBg: "var(--figma-color-bg-secondary)",
          tertiaryBg: "var(--figma-color-bg-tertiary)",
          divider: "var(--figma-color-border)",
          hoverBg: "var(--figma-color-bg-hover)",
        },
        "figma-bg": "var(--bg-figma)",
        "figma-secondaryBg": "var(--bg-figma-secondary)",
        "figma-secondaryBg-hover": "var(--bg-figma-secondary-hover)",
        "figma-tertiaryBg": "var(--bg-figma-tertiary)",
        "figma-blue": "var(--blue-figma)",
        "figma-blue-hover": "var(--blue-figma-hover)",
        "figma-primary": "var(--text-figma)",
        "figma-secondary": "var(--text-figma-secondary)",
        "figma-primary-hover": "var(--text-figma-hover)",
        "figma-secondary-hover": "var(--text-figma-secondary-hover)",
        "figma-onBrand": "var(--text-figma-onbrand)",
        "figma-brand": "var(--text-figma-brand)",
        "figma-border": "var(--border-figma)",
        "figma-icon": "var(--icon-figma)",
      },
      fontSize: {
        xs: ["11px", "16px"],
        sm: ["12px", "16px"],
        base: ["13px", "20px"],
      },
    },
  },
  plugins: [],
};
