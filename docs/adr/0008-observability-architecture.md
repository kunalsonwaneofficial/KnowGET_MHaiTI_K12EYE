# 8. Observability & DevOps (EODP) architecture

- **Status:** Accepted
- **Date:** 2026-07-17
- **Contract:** P1-M06

## Context

P1-M06 must make the platform observable and operable — metrics, tracing,
alerting, diagnostics, reliability — without binding to a specific vendor and
without introducing domain concepts, so every layer already built can be
measured and defended in production and Phase-2 domains inherit instrumentation
for free.

## Decision

- **One package per capability, port + in-memory default.** `@knowget/metrics`
  (instruments + Prometheus exposition), `@knowget/tracing` (spans + tracer +
  exporter), `@knowget/alerting` (threshold rules + manager), `@knowget/diagnostics`
  (runtime snapshot + contributors), `@knowget/reliability` (retry/timeout/circuit
  breaker). Concrete backends (OTLP, Prometheus remote-write, an APM) replace the
  exporters behind the same seams.

- **Standard exposition, not a bespoke protocol.** Metrics render in the
  Prometheus text-exposition format; the `/metrics` endpoint is a plain scrape
  target and `/diagnostics` a structured JSON snapshot. This makes the platform
  consumable by the entire Prometheus/Grafana ecosystem with no adapter.

- **Correlation → trace bridge.** Tracing spans carry a `traceId`; a root span
  adopts an inbound trace/correlation id when provided. The API's request
  interceptor uses the runtime-context correlation id as the span trace id, so
  the existing correlation tracing becomes first-class spans (resolves TD-10).

- **Single live integration seam.** One global `MetricsTracingInterceptor`
  records a labelled request counter, a latency histogram and a per-request span.
  Adding instrumentation is a provider/interceptor concern, not per-controller
  boilerplate.

- **Deterministic by construction.** The tracer, circuit breaker and retry take
  injectable clocks/sleep, and the diagnostics runtime source is injectable — the
  whole observability layer is reproducible and Prisma-free, so it is verified
  in-sandbox; only the API assembly is CI-gated.

- **DevOps.** The Prisma client generates a `linux-musl-openssl-3.0.x` target so
  it runs on Alpine images (resolves TD-15); the CI pipeline (verify/security/E2E
  with the `feat/**` pre-merge gate) is the release gate. Container-image slimming,
  backup/recovery and a dashboard UI are operations-phase concerns, deferred with
  rationale rather than stubbed.

## Consequences

- Every request is measured and traced; domains inherit `/metrics` and
  `/diagnostics` and can register alert rules and diagnostic contributors.
- Vendor-neutral: swapping in OTLP/Prometheus-remote/APM is an exporter change.
- **Deferred (interface-protected):** in-memory metric/span/alert state (→ real
  exporters and shared stores), image slimming (TD-06), local E2E (TD-07), and
  backup/recovery + dashboards (operations phase).
