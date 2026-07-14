import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Brend (primary) rangi — yagona manba. Rebrand = shu bitta qatorni
      // o'zgartirish (masalan colors.indigo). Butun ilova `primary-*` ishlatadi.
      colors: {
        primary: colors.blue,
      },
      fontFamily: {
        sans: [
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
