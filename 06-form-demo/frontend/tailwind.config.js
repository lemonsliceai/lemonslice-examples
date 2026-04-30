/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        inter: ["var(--font-inter)", "system-ui", "sans-serif"],
        "geist-mono": ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "demo-confirm-backdrop": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        /** From above + tilt; scaleX animates more than scaleY (directional stretch); slight settle overshoot */
        "demo-confirm-card": {
          "0%": {
            opacity: "0",
            transform:
              "translateY(-64px) rotate(-8deg) scaleX(0.58) scaleY(0.84)",
          },
          "72%": {
            opacity: "1",
            transform:
              "translateY(5px) rotate(1.5deg) scaleX(1.06) scaleY(0.978)",
          },
          "100%": {
            opacity: "1",
            transform:
              "translateY(0) rotate(0deg) scaleX(1) scaleY(1)",
          },
        },
      },
      animation: {
        "demo-confirm-backdrop": "demo-confirm-backdrop 280ms ease-out forwards",
        "demo-confirm-card":
          "demo-confirm-card 680ms cubic-bezier(0.18, 1, 0.32, 1) forwards",
      },
      colors: {
        accent: "#111111",
        lime: {
          DEFAULT: "#dfff4a",
          dark: "#c8e830",
        },
        border: "#e6e6e6",
        muted: "#5c5c5c",
        danger: "#e04545",
        sidebar: "#fafafa",
        bubble: "#ececec",
      },
    },
  },
  plugins: [],
};
