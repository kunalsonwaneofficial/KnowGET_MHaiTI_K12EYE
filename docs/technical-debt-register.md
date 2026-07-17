# Technical-Debt Register

Deliberately-deferred capabilities, each behind a stable interface, with the
contract that will resolve them. Reviewed and burned down at every certification
milestone.

| #     | Item                                                                                                                        | Interface protecting callers                    | Resolved by                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| TD-01 | Event bus is in-process only                                                                                                | `EventBus` (`@knowget/events`)                  | P1-M05 → P3-D02                          |
| TD-02 | ~~No real persistence~~ (resolved)                                                                                          | `@knowget/persistence` + `@knowget/database`    | ✅ P1-M03                                |
| TD-03 | Auth is contracts only (no login/token issuance)                                                                            | `Principal` / permission fns (`@knowget/auth`)  | P1-M04                                   |
| TD-04 | Security is foundational (no full crypto/key mgmt)                                                                          | `@knowget/security` exports                     | P1-M04                                   |
| TD-05 | SDK exposes only `health()`                                                                                                 | `KnowGetClient` (`@knowget/sdk`)                | P3-D01                                   |
| TD-06 | Docker images copy the full workspace (not slimmed)                                                                         | `Dockerfile.*`                                  | P1-M06                                   |
| TD-07 | Playwright E2E runs in CI only (not local verify)                                                                           | `apps/web` `test:e2e`                           | P1-M06                                   |
| TD-09 | Feature flags are static/config-driven only                                                                                 | `FeatureFlagService` (`@knowget/configuration`) | later                                    |
| TD-10 | Distributed tracing is correlation-id only (no spans)                                                                       | `RuntimeContext.traceId`                        | P1-M06                                   |
| TD-11 | Secrets provider is env-backed only                                                                                         | `SecretsProvider` (`@knowget/configuration`)    | P1-M04 (KMS)                             |
| TD-12 | Prisma engine CDN unreachable in the build sandbox → Prisma-client build + DB integration tests are CI-verified (not local) | —                                               | environmental                            |
| TD-13 | RLS requires the app to connect as a **non-superuser** (superusers bypass RLS) — deployment/ops requirement                 | `withTenant` (`@knowget/database`)              | P5-D03 (ops docs)                        |
| TD-14 | `DataProbe` is a platform verification fixture                                                                              | `dataProbeRepository`                           | remove when domain tables land (Phase 2) |
| TD-15 | Prisma `binaryTargets` = native only; Docker alpine needs `linux-musl-openssl-3.0.x`                                        | `schema.prisma`                                 | P1-M06                                   |

No `TODO` markers exist in the codebase; deferrals are tracked here instead.
