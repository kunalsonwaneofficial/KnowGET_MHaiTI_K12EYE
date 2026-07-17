# Technical-Debt Register

Deliberately-deferred capabilities, each behind a stable interface, with the
contract that will resolve them. Reviewed and burned down at every certification
milestone.

| #     | Item                                                | Interface protecting callers                   | Resolved by             |
| ----- | --------------------------------------------------- | ---------------------------------------------- | ----------------------- |
| TD-01 | Event bus is in-process only                        | `EventBus` (`@knowget/events`)                 | P1-M05 → P3-D02         |
| TD-02 | No real persistence yet (Prisma/pooling/RLS)        | `DatabaseConnection` (`@knowget/database`)     | P1-M03                  |
| TD-03 | Auth is contracts only (no login/token issuance)    | `Principal` / permission fns (`@knowget/auth`) | P1-M04                  |
| TD-04 | Security is foundational (no full crypto/key mgmt)  | `@knowget/security` exports                    | P1-M04                  |
| TD-05 | SDK exposes only `health()`                         | `KnowGetClient` (`@knowget/sdk`)               | P3-D01 (SDK generation) |
| TD-06 | Docker images copy the full workspace (not slimmed) | `Dockerfile.*`                                 | P1-M06                  |
| TD-07 | Playwright E2E runs in CI only (not local verify)   | `apps/web` `test:e2e`                          | P1-M06                  |
| TD-08 | No runtime config/DI/tenant-context yet             | —                                              | P1-M02                  |

No `TODO` markers exist in the codebase; deferrals are tracked here instead.
