import base from "@knowget/config/eslint";

export default [
  ...base,
  {
    rules: {
      // NestJS relies on value imports for DI metadata (emitDecoratorMetadata);
      // enforcing type-only imports here would break dependency injection.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
