# Architecture

KnowGET MHaiTI is an AI-native, multi-tenant institutional operating system for
K-12 education, built as a single Turborepo + pnpm monorepo and engineered in
dependency-ordered phases.

## Principles

- **Layered, dependency-ordered construction.** A certified Platform Core
  (Phase 1) underpins Enterprise Domains (Phase 2), Integration (Phase 3),
  Experience (Phase 4), Operations/Governance/Security (Phase 5), and long-term
  Evolution (Phase 6).
- **Reuse over duplication.** Cross-cutting capabilities are built once in
  `packages/` and consumed everywhere via stable abstractions, APIs, and events.
  Domains never reach into each other's data.
- **Separation of intent from technology.** Domains own intent; platform and
  integration layers own the technology (databases, providers, AI models) behind
  replaceable adapters.
- **Security & privacy by design; explainable, human-in-the-loop AI;
  everything auditable and versioned.**

## Repository layout

| Path                                              | Purpose                                                    |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `apps/api`                                        | NestJS API — host for the Platform Runtime Kernel (P1-M02) |
| `apps/web` · `apps/admin` · `apps/docs`           | Next.js experiences                                        |
| `packages/config`                                 | Shared ESLint / Prettier presets                           |
| `packages/types` · `shared`                       | Shared types and runtime utilities                         |
| `packages/logging` · `events`                     | Structured logging and the event-bus foundation            |
| `packages/testing`                                | Shared test helpers                                        |
| `packages/ui`                                     | Shared React UI (Tailwind)                                 |
| `packages/database` · `auth` · `security` · `sdk` | Foundations extended in P1-M03/M04                         |
| `infrastructure/`                                 | Docker, CI/CD, monitoring, deployment                      |

## Technology stack (locked)

Turborepo · pnpm · NestJS · Next.js · React · TypeScript · Tailwind CSS ·
PostgreSQL · Prisma · Redis · Docker · GitHub Actions · ESLint · Prettier ·
Husky · lint-staged · Commitlint · Vitest · Playwright.

These are not substituted without explicit approval. See
[`adr/0002-monorepo-tooling-and-technology-stack.md`](adr/0002-monorepo-tooling-and-technology-stack.md).

## Module & package model

Internal packages compile to CommonJS `dist/` with type declarations and are
consumed by both the NestJS API and the Next.js apps. Turborepo builds them in
topological order (`dependsOn: ["^build"]`). See
[`adr/0003-compiled-internal-packages.md`](adr/0003-compiled-internal-packages.md).

## Event-driven integration

Every significant institutional fact becomes a domain event. `@knowget/events`
provides the typed, error-isolating in-process bus; P1-M05 hardens it and
P3-D02 introduces a distributed streaming backbone behind the same interface.

## Multi-tenancy

A hybrid application-context + PostgreSQL Row-Level Security model is
established at the data layer in P1-M03 and carried through every domain. Tenant
isolation is a certification item at every relevant quality gate.
