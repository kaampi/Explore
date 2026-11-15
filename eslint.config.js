import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "dist/", "coverage/", "src-tauri/", "public/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Existing code has these. They are reported, not blocking. Fix them in small cleanups.
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "no-useless-escape": "warn",
      "no-useless-assignment": "warn",
      "no-empty": "warn",
      "prefer-const": "warn",
      "require-yield": "warn",
    },
  },
  {
    files: ["server/**/*.{ts,js,mjs}", "scripts/**/*.{ts,js,mjs}", "*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
);
