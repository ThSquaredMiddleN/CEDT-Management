/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "brand-primary": "var(--color-brand-primary)",
        "brand-primary-hover": "var(--color-brand-primary-hover)",
        "button-primary-hover": "var(--color-button-primary-hover)",
        "button-primary-pressed": "var(--color-button-primary-pressed)",
        "button-primary-pressed-border": "var(--color-button-primary-pressed-border)",
        "button-primary-disabled-foreground": "var(--color-button-primary-disabled-foreground)",
        "button-primary-disabled-background": "var(--color-button-primary-disabled-background)",
        white: "var(--color-white)",
        surface: "var(--color-surface)",
        background: "var(--color-background)",
        "white-50": "var(--color-white-50)",
        black: "var(--color-black)",
        grey: {
          100: "var(--color-grey-100)",
          200: "var(--color-grey-200)",
          400: "var(--color-grey-400)",
          700: "var(--color-grey-700)",
          900: "var(--color-grey-900)",
        },
      },
      fontFamily: {
        body: ["var(--font-family-body)"],
      },
      fontSize: {
        "display-md": [
          "var(--text-display-md-size)",
          {
            lineHeight: "var(--text-display-md-line-height)",
            fontWeight: "var(--text-display-md-weight)",
            letterSpacing: "var(--text-display-md-letter-spacing)",
          },
        ],
        "header-lg": [
          "var(--text-header-lg-size)",
          {
            lineHeight: "var(--text-header-lg-line-height)",
            fontWeight: "var(--text-header-lg-weight)",
            letterSpacing: "var(--text-header-lg-letter-spacing)",
          },
        ],
        "header-lg-emphasize": [
          "var(--text-header-lg-emphasize-size)",
          {
            lineHeight: "var(--text-header-lg-emphasize-line-height)",
            fontWeight: "var(--text-header-lg-emphasize-weight)",
            letterSpacing: "var(--text-header-lg-emphasize-letter-spacing)",
          },
        ],
        "header-md": [
          "var(--text-header-md-size)",
          {
            lineHeight: "var(--text-header-md-line-height)",
            fontWeight: "var(--text-header-md-weight)",
            letterSpacing: "var(--text-header-md-letter-spacing)",
          },
        ],
        "header-md-emphasize": [
          "var(--text-header-md-emphasize-size)",
          {
            lineHeight: "var(--text-header-md-emphasize-line-height)",
            fontWeight: "var(--text-header-md-emphasize-weight)",
            letterSpacing: "var(--text-header-md-emphasize-letter-spacing)",
          },
        ],
        "header-sm": [
          "var(--text-header-sm-size)",
          {
            lineHeight: "var(--text-header-sm-line-height)",
            fontWeight: "var(--text-header-sm-weight)",
            letterSpacing: "var(--text-header-sm-letter-spacing)",
          },
        ],
        "header-sm-emphasize": [
          "var(--text-header-sm-emphasize-size)",
          {
            lineHeight: "var(--text-header-sm-emphasize-line-height)",
            fontWeight: "var(--text-header-sm-emphasize-weight)",
            letterSpacing: "var(--text-header-sm-emphasize-letter-spacing)",
          },
        ],
        "header-xs": [
          "var(--text-header-xs-size)",
          {
            lineHeight: "var(--text-header-xs-line-height)",
            fontWeight: "var(--text-header-xs-weight)",
            letterSpacing: "var(--text-header-xs-letter-spacing)",
          },
        ],
        "header-xs-emphasize": [
          "var(--text-header-xs-emphasize-size)",
          {
            lineHeight: "var(--text-header-xs-emphasize-line-height)",
            fontWeight: "var(--text-header-xs-emphasize-weight)",
            letterSpacing: "var(--text-header-xs-emphasize-letter-spacing)",
          },
        ],
        "header-xxs": [
          "var(--text-header-xxs-size)",
          {
            lineHeight: "var(--text-header-xxs-line-height)",
            fontWeight: "var(--text-header-xxs-weight)",
            letterSpacing: "var(--text-header-xxs-letter-spacing)",
          },
        ],
        "header-xxs-emphasize": [
          "var(--text-header-xxs-emphasize-size)",
          {
            lineHeight: "var(--text-header-xxs-emphasize-line-height)",
            fontWeight: "var(--text-header-xxs-emphasize-weight)",
            letterSpacing: "var(--text-header-xxs-emphasize-letter-spacing)",
          },
        ],
        "body-md": [
          "var(--text-body-md-size)",
          {
            lineHeight: "var(--text-body-md-line-height)",
            fontWeight: "var(--text-body-md-weight)",
            letterSpacing: "var(--text-body-md-letter-spacing)",
          },
        ],
        "body-md-emphasize": [
          "var(--text-body-md-emphasize-size)",
          {
            lineHeight: "var(--text-body-md-emphasize-line-height)",
            fontWeight: "var(--text-body-md-emphasize-weight)",
            letterSpacing: "var(--text-body-md-emphasize-letter-spacing)",
          },
        ],
        "body-sm": [
          "var(--text-body-sm-size)",
          {
            lineHeight: "var(--text-body-sm-line-height)",
            fontWeight: "var(--text-body-sm-weight)",
            letterSpacing: "var(--text-body-sm-letter-spacing)",
          },
        ],
        "body-sm-emphasize": [
          "var(--text-body-sm-emphasize-size)",
          {
            lineHeight: "var(--text-body-sm-emphasize-line-height)",
            fontWeight: "var(--text-body-sm-emphasize-weight)",
            letterSpacing: "var(--text-body-sm-emphasize-letter-spacing)",
          },
        ],
        "body-xs": [
          "var(--text-body-xs-size)",
          {
            lineHeight: "var(--text-body-xs-line-height)",
            fontWeight: "var(--text-body-xs-weight)",
            letterSpacing: "var(--text-body-xs-letter-spacing)",
          },
        ],
        "body-xs-emphasize": [
          "var(--text-body-xs-emphasize-size)",
          {
            lineHeight: "var(--text-body-xs-emphasize-line-height)",
            fontWeight: "var(--text-body-xs-emphasize-weight)",
            letterSpacing: "var(--text-body-xs-emphasize-letter-spacing)",
          },
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "light-6": "var(--shadow-light-6)",
        button: "var(--shadow-button)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
