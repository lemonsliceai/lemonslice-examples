import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        ringRipple: {
          "0%": { transform: "scale(1)", opacity: "0.4" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        auroraA: {
          "0%, 100%": { transform: "translate(0%, 0%) scale(1)" },
          "33%": { transform: "translate(12%, 8%) scale(1.05)" },
          "66%": { transform: "translate(-8%, 14%) scale(0.98)" },
        },
        auroraB: {
          "0%, 100%": { transform: "translate(0%, 0%) scale(1)" },
          "33%": { transform: "translate(-14%, -10%) scale(1.06)" },
          "66%": { transform: "translate(10%, -6%) scale(0.97)" },
        },
        auroraC: {
          "0%, 100%": { transform: "translate(0%, 0%) scale(1)" },
          "50%": { transform: "translate(8%, -12%) scale(1.08)" },
        },
        auroraD: {
          "0%, 100%": { transform: "translate(0%, 0%) rotate(0deg)" },
          "50%": { transform: "translate(-12%, 10%) rotate(8deg)" },
        },
        gradientShift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        gradientShiftReverse: {
          "0%, 100%": { backgroundPosition: "100% 0%" },
          "50%": { backgroundPosition: "0% 100%" },
        },
      },
      animation: {
        "ring-ripple":
          "ringRipple 2s cubic-bezier(0.22, 1, 0.36, 1) infinite backwards",
        "aurora-a": "auroraA 6s ease-in-out infinite",
        "aurora-b": "auroraB 7s ease-in-out infinite",
        "aurora-c": "auroraC 9s ease-in-out infinite",
        "aurora-d": "auroraD 11s ease-in-out infinite",
        "gradient-shift": "gradientShift 10s ease infinite",
        "gradient-shift-reverse": "gradientShiftReverse 14s ease infinite",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
    },
  },
  plugins: [],
};

export default config;
