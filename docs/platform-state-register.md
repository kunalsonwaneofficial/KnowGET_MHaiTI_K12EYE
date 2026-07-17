# Platform State Register

Authoritative record of what has been engineered, certified, and is reusable.
Updated at the close of every engineering contract.

## Phase 1 — Platform Core Engineering

| Contract                                             | Status         | Notes                                                                 |
| ---------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| P1-M01 Repository & Workspace Foundation             | ✅ Complete    | Monorepo, 11 packages, 4 apps, CI, Docker, hooks. Live on `main`.     |
| P1-M02 Platform Runtime Kernel                       | ✅ In review   | Kernel, context, config, health, exceptions packages + NestJS wiring. |
| P1-M03 Enterprise Data Platform                      | ⬜ Not started | Next milestone.                                                       |
| P1-M04 Security Foundation                           | ⬜ Not started |                                                                       |
| P1-M05 Enterprise Shared Services Platform           | ⬜ Not started |                                                                       |
| P1-M06 Observability & DevOps Platform               | ⬜ Not started |                                                                       |
| P1-M07 Platform Certification & Production Readiness | ⬜ Not started |                                                                       |

## Reusable capabilities available now

| Package                  | Capability                                                      |
| ------------------------ | --------------------------------------------------------------- |
| `@knowget/config`        | Shared ESLint / Prettier presets                                |
| `@knowget/types`         | Branded ids, `DomainEvent`, pagination, guards                  |
| `@knowget/shared`        | `Result`, id/date/text utilities, assertions, boundary branding |
| `@knowget/logging`       | Structured, level-filtered, redacting logger                    |
| `@knowget/events`        | Typed, error-isolating in-process event bus                     |
| `@knowget/testing`       | Deterministic clock, promise flushing                           |
| `@knowget/ui`            | Tailwind `cn`, foundational `Button`                            |
| `@knowget/database`      | Connection config foundation (P1-M03)                           |
| `@knowget/auth`          | Principal / permission contracts (P1-M04)                       |
| `@knowget/security`      | Password policy, constant-time compare, headers                 |
| `@knowget/sdk`           | Typed API client foundation                                     |
| `@knowget/exceptions`    | Standardized error model + safe client responses                |
| `@knowget/context`       | Runtime context + AsyncLocalStorage propagation                 |
| `@knowget/configuration` | Typed schema-validated config, secrets, feature flags           |
| `@knowget/health`        | Health indicator registry (liveness/readiness/startup)          |
| `@knowget/kernel`        | Clock/Id services, lifecycle, runtime events, kernel assembly   |

## Platform runtime (host: `apps/api`)

The Platform Runtime Kernel is wired into the NestJS API via a global
`PlatformModule`: a single `Kernel` instance provides clock/id services, the
event bus, health registry, runtime-context store and lifecycle; requests carry
a correlation context; `/health`, `/health/live`, `/health/ready`,
`/health/startup` expose probes; a global exception filter is the error
boundary; and `OnApplicationBootstrap`/`OnApplicationShutdown` drive kernel
start/stop with graceful shutdown and runtime events.
