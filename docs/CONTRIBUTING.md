# Contributing

## Prerequisites

- Node.js >= 22 (`.nvmrc`)
- pnpm >= 10 via Corepack (`corepack enable`)
- Docker + Docker Compose (for local infra)

## Setup

```bash
bash scripts/bootstrap.sh   # corepack enable + pnpm install
pnpm infra:up               # PostgreSQL + Redis
pnpm verify                 # all quality gates
```

## Workflow

1. Branch from `main`: `git switch -c feat/<short-description>`.
2. Make focused changes; keep packages consuming abstractions, not each other's internals.
3. Run `pnpm verify` locally (or the individual gates).
4. Commit using Conventional Commits — e.g. `feat(api): add health endpoint`.
   The pre-commit and commit-msg hooks enforce formatting and message rules.
5. Open a PR. CI must be green before merge; `main` must always stay releasable.

## Adding a package

- Create `packages/<name>` with `package.json`, `tsconfig.json`,
  `tsconfig.build.json`, `eslint.config.mjs`, and `src/`.
- Name it `@knowget/<name>`, build to `dist/` with `tsc`, and export types.
- Depend on other workspace packages via `workspace:*`.
- Add at least one unit test; wire `build`, `typecheck`, `lint`, `test`, `clean`
  scripts so Turbo picks it up.

## Architecture decisions

Record significant decisions as ADRs under `docs/adr/`. Copy the format of the
existing records.
