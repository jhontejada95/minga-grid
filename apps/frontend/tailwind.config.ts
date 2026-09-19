import type { Config } from "tailwindcss";

// Design tokens exported from the Stitch mockup ("Ecological Protocol" design system).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      "colors": {
        "inverse-surface": "#2e3132",
        "surface": "#f8f9fa",
        "surface-container-highest": "#e1e3e4",
        "tertiary": "#3e1e00",
        "on-primary-fixed-variant": "#274e3d",
        "background": "#f8f9fa",
        "tertiary-fixed-dim": "#ffb77d",
        "error": "#ba1a1a",
        "on-surface-variant": "#414844",
        "primary": "#012d1d",
        "primary-container": "#1b4332",
        "on-secondary-fixed": "#001d32",
        "on-secondary": "#ffffff",
        "on-tertiary-fixed": "#2f1500",
        "inverse-primary": "#a5d0b9",
        "surface-variant": "#e1e3e4",
        "secondary-fixed-dim": "#94ccff",
        "on-primary-container": "#86af99",
        "surface-container-high": "#e7e8e9",
        "primary-fixed": "#c1ecd4",
        "on-primary-fixed": "#002114",
        "on-tertiary-container": "#f48c24",
        "secondary": "#006399",
        "on-secondary-fixed-variant": "#004b74",
        "surface-container-low": "#f3f4f5",
        "on-error-container": "#93000a",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#5e3000",
        "surface-dim": "#d9dadb",
        "tertiary-fixed": "#ffdcc3",
        "surface-container": "#edeeef",
        "outline": "#717973",
        "secondary-fixed": "#cde5ff",
        "primary-fixed-dim": "#a5d0b9",
        "on-background": "#191c1d",
        "surface-tint": "#3f6653",
        "outline-variant": "#c1c8c2",
        "on-primary": "#ffffff",
        "surface-bright": "#f8f9fa",
        "error-container": "#ffdad6",
        "on-tertiary-fixed-variant": "#6e3900",
        "on-secondary-container": "#004972",
        "on-error": "#ffffff",
        "on-surface": "#191c1d",
        "inverse-on-surface": "#f0f1f2",
        "surface-container-lowest": "#ffffff",
        "secondary-container": "#67bafd"
      },
      "borderRadius": {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      "spacing": {
        "space-lg": "1.5rem",
        "gutter-mobile": "1rem",
        "space-2xl": "4rem",
        "space-xs": "0.25rem",
        "space-md": "1rem",
        "margin-mobile": "1rem",
        "margin": "2.5rem",
        "space-xl": "2.5rem",
        "gutter": "1.5rem",
        "space-sm": "0.5rem"
      },
      "fontFamily": {
        "code-xs": [
          "JetBrains Mono",
          "ui-monospace",
          "monospace"
        ],
        "body-md": [
          "Inter",
          "system-ui",
          "sans-serif"
        ],
        "display-lg-mobile": [
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "headline-lg": [
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "code-sm": [
          "JetBrains Mono",
          "ui-monospace",
          "monospace"
        ],
        "headline-xl-mobile": [
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "display-lg": [
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "headline-sm": [
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "headline-xl": [
          "Manrope",
          "system-ui",
          "sans-serif"
        ],
        "body-lg": [
          "Inter",
          "system-ui",
          "sans-serif"
        ],
        "body-sm": [
          "Inter",
          "system-ui",
          "sans-serif"
        ],
        "label-md": [
          "Inter",
          "system-ui",
          "sans-serif"
        ]
      },
      "fontSize": {
        "code-xs": [
          "11px",
          {
            "lineHeight": "16px",
            "letterSpacing": "0em",
            "fontWeight": "400"
          }
        ],
        "body-md": [
          "15px",
          {
            "lineHeight": "24px",
            "letterSpacing": "0em",
            "fontWeight": "400"
          }
        ],
        "display-lg-mobile": [
          "32px",
          {
            "lineHeight": "40px",
            "letterSpacing": "-0.01em",
            "fontWeight": "700"
          }
        ],
        "headline-lg": [
          "28px",
          {
            "lineHeight": "36px",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "code-sm": [
          "12px",
          {
            "lineHeight": "18px",
            "letterSpacing": "-0.01em",
            "fontWeight": "500"
          }
        ],
        "headline-xl-mobile": [
          "26px",
          {
            "lineHeight": "34px",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "display-lg": [
          "48px",
          {
            "lineHeight": "56px",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ],
        "headline-sm": [
          "20px",
          {
            "lineHeight": "28px",
            "letterSpacing": "0em",
            "fontWeight": "600"
          }
        ],
        "headline-xl": [
          "36px",
          {
            "lineHeight": "44px",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ],
        "body-lg": [
          "18px",
          {
            "lineHeight": "28px",
            "letterSpacing": "-0.005em",
            "fontWeight": "400"
          }
        ],
        "body-sm": [
          "13px",
          {
            "lineHeight": "20px",
            "letterSpacing": "0.005em",
            "fontWeight": "400"
          }
        ],
        "label-md": [
          "12px",
          {
            "lineHeight": "16px",
            "letterSpacing": "0.04em",
            "fontWeight": "600"
          }
        ]
      }
    },
  },
  plugins: [],
};

export default config;
