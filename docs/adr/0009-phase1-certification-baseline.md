# 9. Phase-1 certification and baseline freeze

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M07

## Context

P1-M07 closes Phase 1. It adds no features; it must certify the platform core and
establish an immutable reference point that Phase-2 domains build on, so that
regressions and architectural drift are detectable against a known-good baseline.

## Decision

- **Certify against fixed dimensions.** Architecture, quality, security, data,
  runtime, services, observability, performance, DX/ops and AI-readiness are each
  certified with concrete evidence in the Phase-1 Certification Report. A
  dimension passes only on evidence (gate output, tests, verified behaviour), not
  assertion.

- **Freeze and tag the baseline.** The certified `main` commit is tagged
  **`v0.1.0`** (annotated). The tag is the reference for Phase-2 regression
  comparison and for reproducing the certified state.

- **Performance baselines are reproducible, not aspirational.** A committed
  harness (`tools/benchmarks/bench.cjs`, `pnpm bench`) measures representative
  operations against built packages. Numbers are for **regression detection**
  across milestones, explicitly not SLAs; password hashing is expected to be slow
  (scrypt work factor).

- **One-command certification.** `pnpm certify` runs every gate then the
  baseline, mirroring CI, so certification is repeatable by anyone.

- **Debt must be bounded and interface-protected to exit.** Phase 1 closes only
  with every deferral behind a stable interface and none blocking Phase-2 domain
  construction; the register is the single source of deferrals (no in-code TODOs).

## Consequences

- Phase 2 starts from a stamped, reproducible foundation with a clear contract:
  domains extend the core, they do not modify it.
- Regressions (quality, architecture, or performance) are measurable against
  `v0.1.0`.
- The Prisma-dependent build remains CI-verified (TD-12); `pnpm certify`'s full
  build therefore requires the Prisma engine (CI or a networked dev host), while
  the Prisma-free core is fully certifiable in any sandbox.
