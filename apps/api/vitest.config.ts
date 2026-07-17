import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC transforms enable NestJS decorator metadata under Vitest.
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    root: "./",
  },
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
