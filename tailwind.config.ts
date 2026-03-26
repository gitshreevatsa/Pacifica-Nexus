import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Pacifica Nexus Design System
        midnight: {
          DEFAULT: "#080808",
          50: "#0a0a0a",
          100: "#0d0d0d",
          200: "#111111",
          300: "#161616",
        },
        electric: {
          DEFAULT: "#0062FF",
          50: "#E5EEFF",
          100: "#B3CFFF",
          200: "#80AFFF",
          300: "#4D8FFF",
          400: "#1A6FFF",
          500: "#0062FF",
          600: "#004FCC",
          700: "#003C99",
          800: "#002966",
          900: "#001633",
        },
        neon: {
          green: "#00FF87",
          "green-dim": "#00C96C",
        },
        danger: {
          DEFAULT: "#FF3B5C",
          dim: "#CC2F4A",
        },
        warning: {
          DEFAULT: "#FFB800",
          dim: "#CC9300",
        },
        surface: {
          DEFAULT: "#0a0a0a",
          raised: "#111111",
          overlay: "#161616",
          border: "#222222",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-electric": "linear-gradient(135deg, #0062FF 0%, #003C99 100%)",
        "gradient-neon": "linear-gradient(135deg, #00FF87 0%, #00C96C 100%)",
        "gradient-dark": "linear-gradient(180deg, #080B14 0%, #0D1220 100%)",
      },
      boxShadow: {
        electric: "0 0 20px rgba(0, 98, 255, 0.35)",
        neon: "0 0 20px rgba(0, 255, 135, 0.35)",
        danger: "0 0 20px rgba(255, 59, 92, 0.35)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        ticker: "ticker 30s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
