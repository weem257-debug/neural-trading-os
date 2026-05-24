import type { Config } from "tailwindcss";

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
        // Neural Trading OS Palette
        base: "#080B14",
        "base-2": "#0D1117",
        "base-3": "#111827",
        cyan: {
          DEFAULT: "#00D4FF",
          glow: "#00D4FF40",
          dim: "#00D4FF20",
          50: "#E0FAFF",
          100: "#B3F4FF",
          200: "#80EDFF",
          300: "#4DE6FF",
          400: "#1ADFFF",
          500: "#00D4FF",
          600: "#00AAD4",
          700: "#007FA8",
          800: "#00557C",
          900: "#002A50",
        },
        neon: {
          green: "#00FF88",
          "green-glow": "#00FF8840",
          "green-dim": "#00FF8820",
          pink: "#FF0080",
          "pink-glow": "#FF008040",
          "pink-dim": "#FF008020",
          purple: "#7B2FFF",
          "purple-glow": "#7B2FFF40",
          "purple-dim": "#7B2FFF20",
          yellow: "#FFD700",
          "yellow-glow": "#FFD70040",
        },
        glass: {
          DEFAULT: "rgba(255,255,255,0.03)",
          border: "rgba(255,255,255,0.08)",
          "border-bright": "rgba(0,212,255,0.3)",
          hover: "rgba(255,255,255,0.06)",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)",
        "radial-cyan":
          "radial-gradient(ellipse at center, rgba(0,212,255,0.15) 0%, transparent 70%)",
        "radial-purple":
          "radial-gradient(ellipse at top right, rgba(123,47,255,0.1) 0%, transparent 50%)",
        "glass-card":
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        "glow-cyan":
          "linear-gradient(90deg, transparent, #00D4FF, transparent)",
        "glow-green":
          "linear-gradient(90deg, transparent, #00FF88, transparent)",
        "glow-pink":
          "linear-gradient(90deg, transparent, #FF0080, transparent)",
        "buy-gradient":
          "linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.1))",
        "sell-gradient":
          "linear-gradient(135deg, rgba(255,0,128,0.15), rgba(123,47,255,0.1))",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      boxShadow: {
        "glow-cyan": "0 0 20px rgba(0,212,255,0.4), 0 0 40px rgba(0,212,255,0.2)",
        "glow-cyan-sm": "0 0 10px rgba(0,212,255,0.3)",
        "glow-green": "0 0 20px rgba(0,255,136,0.4), 0 0 40px rgba(0,255,136,0.2)",
        "glow-green-sm": "0 0 10px rgba(0,255,136,0.3)",
        "glow-pink": "0 0 20px rgba(255,0,128,0.4), 0 0 40px rgba(255,0,128,0.2)",
        "glow-pink-sm": "0 0 10px rgba(255,0,128,0.3)",
        "glow-purple": "0 0 20px rgba(123,47,255,0.4), 0 0 40px rgba(123,47,255,0.2)",
        "glass": "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        "glass-hover": "0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        "inner-glow-cyan": "inset 0 0 20px rgba(0,212,255,0.1)",
      },
      animation: {
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "glow-pulse-green": "glow-pulse-green 2s ease-in-out infinite",
        "glow-pulse-pink": "glow-pulse-pink 2s ease-in-out infinite",
        "data-stream": "data-stream 3s linear infinite",
        "grid-flicker": "grid-flicker 8s ease-in-out infinite",
        "ticker-scroll": "ticker-scroll 30s linear infinite",
        "float": "float 6s ease-in-out infinite",
        "scan-line": "scan-line 4s linear infinite",
        "blink": "blink 1s step-end infinite",
        "border-glow": "border-glow 2s ease-in-out infinite",
        "counter-up": "counter-up 0.5s ease-out forwards",
        "slide-in-right": "slide-in-right 0.3s ease-out forwards",
        "fade-in-up": "fade-in-up 0.4s ease-out forwards",
        "neural-pulse": "neural-pulse 3s ease-in-out infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(0,212,255,0.3)" },
          "50%": { boxShadow: "0 0 25px rgba(0,212,255,0.6), 0 0 50px rgba(0,212,255,0.3)" },
        },
        "glow-pulse-green": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(0,255,136,0.3)" },
          "50%": { boxShadow: "0 0 25px rgba(0,255,136,0.6), 0 0 50px rgba(0,255,136,0.3)" },
        },
        "glow-pulse-pink": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(255,0,128,0.3)" },
          "50%": { boxShadow: "0 0 25px rgba(255,0,128,0.6), 0 0 50px rgba(255,0,128,0.3)" },
        },
        "data-stream": {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 100%" },
        },
        "grid-flicker": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.6" },
        },
        "ticker-scroll": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "scan-line": {
          "0%": { top: "0%" },
          "100%": { top: "100%" },
        },
        "blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "border-glow": {
          "0%, 100%": { borderColor: "rgba(0,212,255,0.3)" },
          "50%": { borderColor: "rgba(0,212,255,0.8)" },
        },
        "counter-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "neural-pulse": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
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
