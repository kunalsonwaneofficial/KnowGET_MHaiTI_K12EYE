# 3. Compiled internal packages

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M01

## Context

Internal packages in `packages/` are consumed by both a NestJS application
(CommonJS, `tsc`-built, relies on decorator metadata) and Next.js applications
(ESM/bundler). We need a package model that works cleanly for both without
ESM/CJS interop hazards or fragile path mapping.

## Decision

Each internal package compiles with `tsc` to a CommonJS `dist/` with type
declarations, exposing `main`/`types`/`exports`. Turborepo builds packages in
topological order via `dependsOn: ["^build"]`. Packages extend the root
`tsconfig.base.json` via relative path; the React UI package additionally
enables the JSX runtime and DOM libs, and is listed in `transpilePackages` where
consumed by Next.js.

Test files are excluded from build via a `tsconfig.build.json` overlay;
type-checking still covers them through `tsconfig.json`.

## Consequences

- One package format is consumable by NestJS, Next.js, Node, and Vitest.
- Consumers must be built after their dependencies — Turbo handles ordering and
  caching.
- An alternative "just-in-time / source-exported" package model was rejected for
  P1 due to NestJS `tsc` build friction; it can be revisited later behind the
  same public entry points.
