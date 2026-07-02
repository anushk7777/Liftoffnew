/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Monochrome Editorial — ink-on-white accent, layered blacks
        "secondary-fixed-dim": "#bdbdbb",
        "outline-variant": "#232325",
        "inverse-primary": "#0a0a0b",
        "on-tertiary-container": "#dadada",
        "surface-tint": "#f4f3f1",
        "surface-container-lowest": "#060607",
        "on-secondary-container": "#f4f3f1",
        "error-container": "#5a2a2a",
        "secondary-fixed": "#e6e6e4",
        "surface-bright": "#232325",
        "on-primary": "#0a0a0b",
        "on-secondary-fixed": "#0a0a0b",
        "on-primary-fixed": "#0a0a0b",
        "on-primary-container": "#0a0a0b",
        "surface-variant": "#232325",
        "on-tertiary": "#0a0a0b",
        "surface-container-highest": "#232325",
        "secondary": "#d4d4d2",
        "background": "#0a0a0b",
        "on-secondary": "#0a0a0b",
        "primary": "#f4f3f1",
        "on-secondary-fixed-variant": "#3a3a3c",
        "tertiary-container": "#3a3a3c",
        "inverse-surface": "#f4f3f1",
        "on-error": "#0a0a0b",
        "on-error-container": "#ffd9d9",
        "primary-container": "#ffffff",
        "tertiary": "#c4c4c4",
        "error": "#d98a8a",
        "surface-container-low": "#0d0d0e",
        "surface": "#131314",
        "secondary-container": "#3a3a3c",
        "tertiary-fixed": "#e2e2e2",
        "on-surface-variant": "#8d8c92",
        "surface-container": "#131314",
        "on-primary-fixed-variant": "#0a0a0b",
        "inverse-on-surface": "#0a0a0b",
        "on-background": "#f4f3f1",
        "on-tertiary-fixed": "#0a0a0b",
        "tertiary-fixed-dim": "#c4c4c4",
        "outline": "#343437",
        "on-tertiary-fixed-variant": "#444444",
        "surface-container-high": "#1b1b1d",
        "primary-fixed-dim": "#f4f3f1",
        "primary-fixed": "#ffffff",
        "surface-dim": "#0a0a0b",
        "on-surface": "#f4f3f1",

        // Legacy fallbacks
        "bg": "#0a0a0b",
        "surface-legacy": "#131314",
        "elevated": "#1b1b1d",
        "sidebar": "#0d0d0e",
        "border": "#232325",
        "border-strong": "#343437",
        "hover": "rgba(255, 255, 255, 0.05)",
        "hover-strong": "rgba(255, 255, 255, 0.09)",
        "text": "#f4f3f1",
        "text-muted": "#8d8c92",
        "text-subtle": "#5a595f",
        "accent": "#f4f3f1",
        "danger": "#d98a8a",
        "success": "#8fbf9a",
        "warning": "#d9b06a",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.375rem",
        "xl": "0.5rem",
        "full": "9999px"
      },
      spacing: {
        "max-width": "1440px",
        "gutter": "24px",
        "margin-mobile": "16px",
        "unit": "4px",
        "margin-desktop": "48px"
      },
      // Mirrors the CSS-var type system in index.css (the source of truth).
      // NOTE: no "mono-data" here — index.css owns .font-mono-data (JetBrains).
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Instrument Serif", "Georgia", "serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      fontSize: {
        "body-lg": ["16px", {"lineHeight": "1.6", "letterSpacing": "0", "fontWeight": "400"}],
        "label-caps": ["12px", {"lineHeight": "1", "letterSpacing": "0.1em", "fontWeight": "600"}],
        "display-lg": ["48px", {"lineHeight": "1.1", "letterSpacing": "-0.04em", "fontWeight": "700"}],
        "display-lg-mobile": ["36px", {"lineHeight": "1.2", "letterSpacing": "-0.02em", "fontWeight": "700"}],
        "body-sm": ["14px", {"lineHeight": "1.5", "letterSpacing": "0", "fontWeight": "400"}],
        "mono-data": ["13px", {"lineHeight": "1.4", "letterSpacing": "0", "fontWeight": "400"}],
        "headline-md": ["24px", {"lineHeight": "1.3", "letterSpacing": "-0.01em", "fontWeight": "600"}]
      },
      animation: {
        'rise': 'rise 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'spin': 'spin 1s linear infinite',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
