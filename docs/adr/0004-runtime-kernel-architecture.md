# 4. Runtime kernel architecture

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M02

## Context

P1-M02 requires a platform runtime kernel: bootstrap, dependency injection, a
module system, a configuration engine, runtime context, lifecycle, kernel
services, a health framework, runtime events, and an error boundary. The
mandated stack includes NestJS, which already provides DI, a module system, and
lifecycle hooks. The specification also lists ~10 candidate packages but permits
the structure to evolve where it improves architecture.

## Decision

We build the kernel as **framework-independent core packages** and adopt
**NestJS as the DI/module host** rather than reinventing a container:

- `@knowget/exceptions` — standardized error model + safe client responses.
- `@knowget/context` — `RuntimeContext` propagated via `AsyncLocalStorage`.
- `@knowget/configuration` — Zod-validated typed config, secrets abstraction,
  feature flags. Business logic never reads `process.env` directly.
- `@knowget/health` — health indicator registry (liveness/readiness/startup).
- `@knowget/kernel` — clock/id services, ordered lifecycle, typed runtime
  events, and the `Kernel` assembly wiring events/logging/health/context.

The NestJS API hosts the kernel through a `@Global() PlatformModule`: the kernel
is a single provider; a correlation middleware establishes per-request context;
a global `AllExceptionsFilter` is the error boundary; and a lifecycle service
maps `OnApplicationBootstrap`/`OnApplicationShutdown` to `kernel.start/stop`.

Correlation is applied as a **framework-agnostic global middleware** (not the
Nest `MiddlewareConsumer`) to avoid the path-to-regexp v8 wildcard changes in
NestJS 11 and to keep the logic testable in isolation.

## Consequences

- Kernel capabilities are reusable outside NestJS (workers, jobs, tests).
- We do not fight or duplicate NestJS DI; enterprise modules plug in normally.
- The 10 candidate packages are consolidated into 5 cohesive ones (`ids` →
  `@knowget/shared`; `runtime`/`platform-core`/`lifecycle`/`diagnostics` →
  `@knowget/kernel`), reducing micro-package overhead while preserving the
  separation of concerns the specification intends.
