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
        // Every token resolves to the CSS variables in index.css, so the SAME
        // class is correct in light and dark (and inside any workspace scope).
        // NOTE (Tailwind v3): var() colors don't support `/opacity` modifiers —
        // use the *-soft tokens or color-mix in an inline style instead.
        "surface-tint": "var(--accent)",
        "surface-container-lowest": "var(--bg)",
        "on-secondary-container": "var(--text)",
        "error-container": "var(--danger)",
        "surface-bright": "var(--elevated)",
        "on-primary": "var(--accent-text)",
        "on-primary-container": "var(--accent-text)",
        "surface-variant": "var(--elevated)",
        "surface-container-highest": "var(--elevated)",
        "secondary": "var(--cozy)",
        "background": "var(--bg)",
        "on-secondary": "var(--accent-text)",
        "primary": "var(--accent)",
        "inverse-primary": "var(--bg)",
        "tertiary-container": "var(--elevated)",
        "inverse-surface": "var(--text)",
        "on-error": "var(--accent-text)",
        "primary-container": "var(--accent)",
        "tertiary": "var(--text-muted)",
        "error": "var(--danger)",
        "surface-container-low": "var(--sidebar)",
        "surface": "var(--surface)",
        "secondary-container": "var(--elevated)",
        "on-surface-variant": "var(--text-muted)",
        "surface-container": "var(--surface)",
        "inverse-on-surface": "var(--bg)",
        "on-background": "var(--text)",
        "outline": "var(--border-strong)",
        "surface-container-high": "var(--elevated)",
        "primary-fixed": "var(--accent)",
        "primary-fixed-dim": "var(--accent)",
        "surface-dim": "var(--bg)",
        "on-surface": "var(--text)",

        // Semantic tokens (shared with index.css)
        "bg": "var(--bg)",
        "elevated": "var(--elevated)",
        "sidebar": "var(--sidebar)",
        "border": "var(--border)",
        "border-strong": "var(--border-strong)",
        "hover": "var(--hover)",
        "hover-strong": "var(--hover-strong)",
        "text": "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-subtle": "var(--text-subtle)",
        "ink": "var(--text)",
        "ink-muted": "var(--text-muted)",
        "ink-subtle": "var(--text-subtle)",
        "accent": "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "cozy": "var(--cozy)",
        "cozy-soft": "var(--cozy-soft)",
        "danger": "var(--danger)",
        "success": "var(--success)",
        "warning": "var(--warning)",
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
