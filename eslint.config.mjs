// ESLint flat config: Next.js core-web-vitals and TypeScript rules from eslint-config-next.
// (Next.js 16 removed the `next lint` wrapper; `npm run lint` runs ESLint directly with Next's config.)
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "logs/**",
      "_to_delete/**",
      "art/source/**",
      "public/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
