import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Shared ESLint flat-config base for the KnowGET MHaiTI monorepo.
 *
 * Uses the non-type-checked TypeScript recommended rules so that linting does
 * not require a prior build. React/Next apps extend this base with their own
 * framework plugins.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
      // TypeScript performs undefined-symbol checking; the core rule misfires
      // on ambient/browser globals, so defer to the compiler.
      "no-undef": "off",
      eqeqeq: ["error", "always"],
    },
  },
  prettier,
);
