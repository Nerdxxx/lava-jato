import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"] },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
];
export default config;
