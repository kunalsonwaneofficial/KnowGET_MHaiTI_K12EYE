import base from "@knowget/config/eslint";

/**
 * Root ESLint flat configuration for the KnowGET MHaiTI monorepo.
 * Individual packages/apps extend this shared base via @knowget/config.
 */
export default [
  ...base,
  {
    ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/node_modules/**"],
  },
];
