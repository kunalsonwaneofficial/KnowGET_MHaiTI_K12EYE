# KnowGET MHaiTI

**AI-Native K-12 Institutional Intelligence Platform** — the unified, multi-tenant operating system for K-12 educational institutions.

This repository is the **single, permanent source of truth** for the entire platform. It is a Turborepo + pnpm monorepo engineered in dependency-ordered phases (Platform Core → Enterprise Domains → Integration → Experience → Operations → Evolution).

> **Milestone status:** `P1-M01 — Repository & Workspace Foundation` (Phase 1, Platform Core Engineering).

---

## Prerequisites

| Tool                    | Version                           |
| ----------------------- | --------------------------------- |
| Node.js                 | `>= 22` (see `.nvmrc`)            |
| pnpm                    | `>= 10` (via Corepack)            |
| Docker + Docker Compose | latest (for local infra services) |

Enable pnpm via Corepack:

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
```

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Bring up local infrastructure (PostgreSQL + Redis)
pnpm infra:up

# 3. Verify the whole workspace
pnpm typecheck   # TypeScript project-wide
pnpm lint        # ESLint (flat config)
pnpm test        # Vitest unit/integration
pnpm build       # Turbo build (topological)

# 4. Run everything in dev
pnpm dev
```

## Workspace layout

```
apps/
  api/      NestJS API (Platform runtime host)
  web/      Next.js public/staff web experience
  admin/    Next.js administration console
  docs/     Documentation site
packages/
  config/       Shared ESLint / Prettier presets
  types/        Shared TypeScript types
  shared/       Shared utilities (Result, guards, ids)
  logging/      Structured logging foundation
  events/       Typed event-bus foundation
  testing/      Shared test presets & helpers
  ui/           Shared React UI (Tailwind)
  database/     Data-platform foundation (P1-M03)
  auth/         Auth foundation (P1-M04)
  security/     Security foundation (P1-M04)
  sdk/          Client SDK foundation
infrastructure/
  docker/       Dockerfiles + docker-compose
  github/        CI/CD supporting assets
  monitoring/   Observability foundation (P1-M06)
  deployment/   Deployment foundation (P1-M06)
tools/          Repo tooling
scripts/        Automation scripts
docs/           Architecture, ADRs, contributing
```

## Engineering standards

Every change must pass: **build · lint · format · type-check · tests**, with no circular workspace dependencies, before it can merge. `main` is always releasable. Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by Commitlint) and are validated by pre-commit hooks (Husky + lint-staged) and CI (GitHub Actions).

See [`docs/architecture.md`](docs/architecture.md) and [`docs/adr/`](docs/adr) for architectural decisions, and [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the workflow.

## License

Proprietary — see [`LICENSE`](LICENSE).
