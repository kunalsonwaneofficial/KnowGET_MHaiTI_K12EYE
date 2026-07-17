# Engineering standards

These standards apply to **every** engineering contract. No milestone is
complete until all of them hold.

## Quality gates

- `pnpm build` — Turbo build passes (topological)
- `pnpm lint` — ESLint passes
- `pnpm format:check` — Prettier formatting passes
- `pnpm typecheck` — TypeScript passes with strict settings
- `pnpm test` — Vitest unit/integration tests pass
- No circular workspace dependencies
- No unresolved critical defects or security findings
- Domain events published consistently; APIs pass integration tests (from P1-M02+)

## Definition of Done

- Implementation complete; architecture clean and drift-free
- Reusable by future domains without re-implementing infrastructure
- Multi-tenant isolation and auditability preserved
- Documentation / ADRs synchronized; technical-debt register updated
- `main` remains releasable

## Source control

- Trunk-based: short-lived feature branches → PR → green CI → merge to `main`
- [Conventional Commits](https://www.conventionalcommits.org/) enforced by
  Commitlint; pre-commit runs lint-staged (ESLint + Prettier)
- `main` is tagged at each phase baseline (e.g. `phase-1-complete`)

## TypeScript

Strict mode is on, plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noUnusedLocals`, and `noUnusedParameters`. Prefer explicit `Result` types over
throwing for expected failures.

## Testing

Vitest for unit/integration (co-located `*.test.ts` / `*.spec.ts`); Playwright
for end-to-end. Every published API and domain event gets contract/integration
coverage as the platform grows.
