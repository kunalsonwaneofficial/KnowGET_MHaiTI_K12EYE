# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M01

## Context

The platform spans 91 engineering contracts over six phases and a multi-year
horizon. Decisions made early (tooling, module model, tenancy) constrain
everything downstream, and the engineering organization must be able to see why
a decision was made long after the fact.

## Decision

We record significant architectural decisions as short, numbered Architecture
Decision Records (ADRs) in `docs/adr/`, following Michael Nygard's format
(Context → Decision → Consequences). Each ADR is immutable once accepted;
changes are captured by a new ADR that supersedes the old one.

## Consequences

- Decisions are discoverable and reviewable in version control.
- PRs that make architectural choices link to an ADR.
- The barrier to proposing a change is low (one small markdown file).
