/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        input: {
          DEFAULT: "rgb(var(--input) / <alpha-value>)",
          background: "rgb(var(--input-background) / <alpha-value>)",
        },
        ring: "rgb(var(--ring) / <alpha-value>)",
        chart: {
          1: "rgb(var(--chart-1) / <alpha-value>)",
          2: "rgb(var(--chart-2) / <alpha-value>)",
          3: "rgb(var(--chart-3) / <alpha-value>)",
          4: "rgb(var(--chart-4) / <alpha-value>)",
          5: "rgb(var(--chart-5) / <alpha-value>)",
        },
      },
      fontSize: {
        display: ["28px", { lineHeight: "34px", letterSpacing: "-0.5px", fontWeight: "700" }],
        title: ["22px", { lineHeight: "28px", letterSpacing: "-0.3px", fontWeight: "700" }],
        heading: ["17px", { lineHeight: "22px", letterSpacing: "-0.2px", fontWeight: "600" }],
        body: ["15px", { lineHeight: "20px", letterSpacing: "0px", fontWeight: "500" }],
        label: ["13px", { lineHeight: "18px", letterSpacing: "0px", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "16px", letterSpacing: "0px", fontWeight: "500" }],
        micro: ["11px", { lineHeight: "14px", letterSpacing: "1.2px", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "10px",
        md: "14px",
        lg: "20px",
        xl: "24px",
        full: "9999px",
      },
      letterSpacing: {
        '0.14em': '0.14em',
      },
    },
  },
  plugins: [],
};
