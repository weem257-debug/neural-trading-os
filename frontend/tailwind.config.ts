import type { Config } from "tailwindcss";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
// The token *names* (cyan / neon.green / neon.pink / neon.purple / neon.yellow,
// shadow-glow-*) are kept because ~40 pages reference them directly. Only the
// values changed: the neon palette was replaced with a restrained dark-finance
// scheme — one blue accent plus semantic red/green — and the outer glows were
// downgraded to ordinary elevation shadows. Keeping the names meant the
// restyle needed no page-by-page rewrite. These values mirror the CSS custom
// properties in src/app/globals.css; change both together.
const ACCENT = "#4C8DF6";
const POSITIVE = "#3FB950";
const NEGATIVE = "#E5534B";
const WARNING = "#D29922";
const VIOLET = "#A371F7";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#0B0E14",
        "base-2": "#10141C",
        "base-3": "#161B24",
        surface: "#131821",
        "surface-hover": "#1A2029",
        cyan: {
          DEFAULT: ACCENT,
          glow: `${ACCENT}40`,
          dim: `${ACCENT}20`,
          50: "#EDF3FE",
          100: "#D6E4FD",
          200: "#AEC9FB",
          300: "#85ADF9",
          400: "#6A9DF7",
          500: ACCENT,
          600: "#3D7BE0",
          700: "#2F63B8",
          800: "#234A8B",
          900: "#17325E",
        },
        neon: {
          green: POSITIVE,
          "green-glow": `${POSITIVE}40`,
          "green-dim": `${POSITIVE}20`,
          pink: NEGATIVE,
          "pink-glow": `${NEGATIVE}40`,
          "pink-dim": `${NEGATIVE}20`,
          purple: VIOLET,
          "purple-glow": `${VIOLET}40`,
          "purple-dim": `${VIOLET}20`,
          yellow: WARNING,
          "yellow-glow": `${WARNING}40`,
        },
        glass: {
          DEFAULT: "#131821",
          border: "rgba(255,255,255,0.08)",
          "border-bright": "rgba(255,255,255,0.14)",
          hover: "#1A2029",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        "radial-cyan":
          "radial-gradient(ellipse at center, rgba(76,141,246,0.08) 0%, transparent 70%)",
        "radial-purple":
          "radial-gradient(ellipse at top right, rgba(163,113,247,0.06) 0%, transparent 50%)",
        "glass-card": "linear-gradient(135deg, #131821 0%, #131821 100%)",
        "glow-cyan": `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
        "glow-green": `linear-gradient(90deg, transparent, ${POSITIVE}, transparent)`,
        "glow-pink": `linear-gradient(90deg, transparent, ${NEGATIVE}, transparent)`,
        "buy-gradient": "linear-gradient(135deg, rgba(63,185,80,0.12), rgba(76,141,246,0.08))",
        "sell-gradient": "linear-gradient(135deg, rgba(229,83,75,0.12), rgba(163,113,247,0.08))",
      },
      backgroundSize: {
        grid: "48px 48px",
      },
      // Glows are now plain elevation. The utility names stay so existing
      // `shadow-glow-cyan-sm` etc. call sites keep compiling.
      boxShadow: {
        "glow-cyan": "0 2px 8px rgba(0,0,0,0.4)",
        "glow-cyan-sm": "0 1px 3px rgba(0,0,0,0.35)",
        "glow-green": "0 2px 8px rgba(0,0,0,0.4)",
        "glow-green-sm": "0 1px 3px rgba(0,0,0,0.35)",
        "glow-pink": "0 2px 8px rgba(0,0,0,0.4)",
        "glow-pink-sm": "0 1px 3px rgba(0,0,0,0.35)",
        "glow-purple": "0 2px 8px rgba(0,0,0,0.4)",
        glass: "0 1px 2px rgba(0,0,0,0.3)",
        "glass-hover": "0 4px 12px rgba(0,0,0,0.4)",
        "inner-glow-cyan": "inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      animation: {
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
        "glow-pulse-green": "glow-pulse-green 2.4s ease-in-out infinite",
        "glow-pulse-pink": "glow-pulse-pink 2.4s ease-in-out infinite",
        "data-stream": "data-stream 3s linear infinite",
        "grid-flicker": "grid-flicker 8s ease-in-out infinite",
        "ticker-scroll": "ticker-scroll 60s linear infinite",
        float: "float 6s ease-in-out infinite",
        "scan-line": "scan-line 4s linear infinite",
        blink: "blink 1.4s step-end infinite",
        "border-glow": "border-glow 2.4s ease-in-out infinite",
        "counter-up": "counter-up 0.4s ease-out forwards",
        "slide-in-right": "slide-in-right 0.25s ease-out forwards",
        "fade-in-up": "fade-in-up 0.3s ease-out forwards",
        "neural-pulse": "neural-pulse 3s ease-in-out infinite",
      },
      keyframes: {
        // Formerly box-shadow flashes; now quiet opacity fades.
        "glow-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "glow-pulse-green": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "glow-pulse-pink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "data-stream": {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 100%" },
        },
        "grid-flicker": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.55" },
        },
        "ticker-scroll": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "scan-line": {
          "0%": { top: "0%" },
          "100%": { top: "100%" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        "border-glow": {
          "0%, 100%": { borderColor: "rgba(255,255,255,0.08)" },
          "50%": { borderColor: "rgba(255,255,255,0.16)" },
        },
        "counter-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "neural-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      backdropBlur: {
        xs: "2px",
        "2xl": "40px",
      },
    },
  },
  plugins: [],
};

export default config;
