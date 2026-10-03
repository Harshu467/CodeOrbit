import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.next/**", "**/next-env.d.ts", "**/*.min.js"],
  },
  ...tseslint.configs.recommended,
];
