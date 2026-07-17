# 2. Monorepo tooling and technology stack

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M01

## Context

The Engineering Specification mandates a specific technology stack and a single,
permanent repository that will host the entire platform without ever being
restructured or forked.

## Decision

We adopt the mandated stack without substitution: **Turborepo + pnpm
workspaces** for the monorepo; **NestJS + TypeScript** for the backend;
**Next.js + React + TypeScript + Tailwind CSS** for frontends; **PostgreSQL +
Prisma** for data; **Redis** for cache; **Docker + Docker Compose** for
containers; **GitHub Actions** for CI/CD; **ESLint, Prettier, Husky,
lint-staged, Commitlint** for quality; **Vitest + Playwright** for testing.

Choices left to engineering (event backbone, search engine, API protocol, AI
and IoT adapters) must sit behind stable abstractions so they can evolve without
disrupting callers.

## Consequences

- No technology in the mandated list is replaced without explicit approval.
- A consistent toolchain across all packages/apps keeps developer experience and
  CI uniform.
- Node 22 and pnpm 10 are pinned (`.nvmrc`, `packageManager`).
