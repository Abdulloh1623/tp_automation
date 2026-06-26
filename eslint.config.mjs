import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // O'zbek tilida apostrof juda ko'p (o', g', ...) — JSX matnida ekranlash
      // o'qishni buzadi va hech qanday xavf yo'q. Shu sabab o'chirildi.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Test fayllari va worker/skriptlar: ataylab `any` va console ishlatishi mumkin
    files: ["**/*.test.ts", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
