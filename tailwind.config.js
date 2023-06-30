/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        figma: 'var(--bg-figma)',
        'figma-secondaryBg': 'var(--bg-figma-secondary)',
        'figma-secondaryBg-hover': 'var(--bg-figma-secondary-hover)',
        'figma-tertiaryBg': 'var(--bg-figma-tertiary)',
        'figma-blue': 'var(--blue-figma)',
        'figma-blue-hover': 'var(--blue-figma-hover)',
        'figma-primary': 'var(--text-figma)',
        'figma-secondary': 'var(--text-figma-secondary)',
        'figma-primary-hover': 'var(--text-figma-hover)',
        'figma-secondary-hover': 'var(--text-figma-secondary-hover)',
        'figma-onBrand': 'var(--text-figma-onbrand)',
        'figma-brand': 'var(--text-figma-brand)',
        'figma-border': 'var(--border-figma)',
        'figma-icon': 'var(--icon-figma)',
      },
    },
  },
  plugins: [],
};
