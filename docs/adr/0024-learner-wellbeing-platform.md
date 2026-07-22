# 24. Learner Wellbeing, Safety & Success Platform: one package, seven aggregates, fine-grained per-area privacy

- **Status:** Accepted
- **Date:** 2026-07-21
- **Contract:** P2-D05 (Learner Wellbeing, Safety & Success Platform)

## Context

Program: Student Lifecycle has delivered the learner model (P2-D03, ADR-0022) and the
family model (P2-D04, ADR-0023) on the certified `v0.2.0` Identity & Organization
baseline and the Governance platform (P2-D02, ADR-0021). P2-D05 is the third contract of
the program: the authoritative model for **protecting, supporting and developing every
learner's physical, emotional, behavioural, psychological and social wellbeing** across
their institutional journey.

The contract defines a single deliverable with seven aggregates (Learner Wellbeing
Profile, Health Record, Behaviour Record, Counselling Case, Safeguarding Case, Learner
Support Plan, Intervention Plan), eleven domain events, and a central non-functional
demand that separates it from every prior domain: **sensitive information must be
protected through fine-grained authorization**. Health, counselling and safeguarding are
not merely "wellbeing" — each is a distinct trust boundary. The contract is explicit that
counselling is _isolated with enhanced privacy_, safeguarding _supports escalation and
traceability_, and health is _protected_. It follows the domain architecture pattern
(ADR-0010) on the certified core with no frozen-code change, and consumes the P2-D03
Student and P2-D01-M02 Person platforms rather than re-modelling them. Clinical diagnosis,
hospital management, grading, attendance, fees, comms campaigns and AI prediction are
explicit non-goals.

## Decision

1. **One domain package, `@knowget/learner-wellbeing`, for all seven aggregates** — the
   same single-bounded-context choice as governance (ADR-0021), student-lifecycle
   (ADR-0022) and family-guardian (ADR-0023). A shared spine (`errors.ts`, `ports.ts`,
   `learner-wellbeing-events.ts`, `index.ts`) plus a per-aggregate pair (`<aggregate>.ts`
   \+ `<aggregate>-service.ts`), with value objects (wellbeing level & dimensions,
   wellbeing indicators & success metric, medical value objects, behaviour observation /
   incident / restorative action / goal / improvement plan, counselling session /
   referral / goal, safeguarding risk / incident report / escalation / external agency,
   support goal & review schedule, intervention & progress note) as small sibling modules.

2. **Every record is about a Student and derives its organization from that Student.** No
   wellbeing aggregate re-declares organization ownership. The cross-domain
   **`StudentDirectory.organizationOf(tenant, student)`** port resolves the learner's
   organization **and** validates existence in a single call, returning `null` when the
   learner does not exist — so a create both proves the Student is real and inherits its
   organization, and the two can never disagree. Counsellors, reporters and responsible
   staff are **Persons**, validated through a `PersonDirectory.exists` port. Both ports
   are adapted at the composition root over the P2-D03 student and P2-D01-M02 person
   services; the pure package depends on neither domain.

3. **Fine-grained, per-area authorization is the core privacy mechanism.** Rather than a
   single `wellbeing:*` scope, each sensitive area carries its **own** read/write pair —
   `wellbeing:*`, `health:*`, `behaviour:*`, `counselling:*`, `safeguarding:*`,
   `support:*`, `intervention:*`. A grant to one area confers **no** access to another:
   holding `wellbeing:read` never exposes a counselling session note or a safeguarding
   concern. Safeguarding is the most restricted surface; counselling is isolated with
   enhanced privacy; health is protected. This is enforced at the transport boundary on
   every controller route (`*_READ` on reads, `*_WRITE` on writes), on top of
   tenant-scoping and FORCE-RLS isolation.

4. **Confidential content never leaves the domain in an event.** The eleven events carry
   only **routing and metadata** — ids, organization, student, counsellor/reporter,
   counts (`activeAlerts`, `sessionCount`), classifications (`severity`, `riskLevel`,
   `observationType`, `escalatedTo`). The presenting concern, session notes, incident
   descriptions, resolutions and outcomes are **never** in a payload, so downstream
   consumers coordinate without learning content.

5. **Records vs cases: one-per-student vs many-per-student.** The Wellbeing Profile,
   Health Record, Behaviour Record, Learner Support Plan and Intervention Plan are **one
   per student** (a `findByStudent` port and a `@@unique([tenantId, studentId])`
   constraint). The Counselling Case and Safeguarding Case are **many per student** — a
   learner may have more than one over time — so they are identified in their own right
   (`listByStudent`, no student uniqueness). Counselling additionally lists by counsellor.

6. **Append-only histories and terminal states for auditability.** Counselling sessions
   and referrals, safeguarding incident reports, escalations and external-agency
   involvements, and behaviour observations/incidents are **append-only** — the audit
   trail of a case is never rewritten. Counselling and safeguarding cases have a
   **terminal** closed/resolved state after which content mutations are refused
   (`CounsellingCaseClosedError`, `SafeguardingCaseResolvedError`). Safeguarding's
   escalation trail (who escalated, to whom, why, when) is the backbone of the contract's
   traceability requirement.

7. **Development over punishment; model, not prediction.** The Behaviour Record leads with
   **positive recognition** and models incidents alongside **restorative actions**,
   developmental **goals** and an **improvement plan**. The Wellbeing Profile's AI-ready
   indicators and the Intervention Plan's early-warning triggers expose a **structured
   surface** for the Institutional Intelligence program to consume — prediction and
   autonomous recommendation are deferred there, not built here.

8. **Persistence per ADR-0010.** Seven tables (`wellbeing_profile`, `health_record`,
   `behaviour_record`, `counselling_case`, `safeguarding_case`, `learner_support_plan`,
   `intervention_plan`) with Prisma/RLS adapters at the `apps/api` composition root
   (TD-21). Every table has `ENABLE` + `FORCE ROW LEVEL SECURITY` and the standard
   `tenant_isolation` policy (both `USING` and `WITH CHECK`, fail-closed on an unset
   tenant), soft-delete and audit columns — verified on live PostgreSQL: per table,
   tenant A sees only its own rows, tenant B sees zero, an unset tenant sees zero, and a
   cross-tenant insert is rejected by the `WITH CHECK` clause. The five one-per-student
   aggregates carry a `(tenant, student)` unique index.

9. **Eleven domain events on the platform bus** — `wellbeing.health_record.created`,
   `wellbeing.medical_alert.updated`, `wellbeing.behaviour_observation.recorded`,
   `wellbeing.behaviour_incident.reported`, `wellbeing.counselling_case.opened`,
   `wellbeing.counselling_case.closed`, `wellbeing.safeguarding_case.opened`,
   `wellbeing.safeguarding_case.escalated`, `wellbeing.intervention.assigned`,
   `wellbeing.intervention.completed`, `wellbeing.support_plan.updated` — published from
   the owning service transitions through the optional `EventBus` seam.

10. **Explicit non-goals.** No clinical diagnosis, hospital management, academic grading,
    attendance calculation, fee management, parent communication campaigns or AI
    prediction engines — those belong to their own domains and integrate _with_ LWSSP.

## Consequences

- **A unified wellbeing model.** Health, behaviour, counselling, safeguarding, support and
  intervention are modelled once, per learner, under one authoritative platform — the
  contract's definition of done.
- **Privacy by construction.** The seven independent permission scopes mean a role can be
  granted, say, behaviour and support access without ever seeing counselling or
  safeguarding content — the fine-grained authorization the contract demands, enforced at
  the transport boundary and backed by tenant FORCE-RLS.
- **Traceable safeguarding.** Every escalation is recorded with its author, target and
  reason on an append-only trail; the case moves through a reported → under-investigation
  → escalated → resolved workflow with a terminal, immutable resolution.
- **Auditability.** Counselling and safeguarding histories are append-only; behaviour
  history is complete; every health-alert change, case open/close, escalation and
  intervention assignment/completion emits a content-free event.
- **Identity integrity.** Every record is about a P2-D03 Student and derives its
  organization from it; staff are P2-D01-M02 Persons; nothing is duplicated.
- **Isolation.** All seven tables are FORCE-RLS tenant-isolated and fail-closed, verified
  on live PostgreSQL.
- **AI-ready, not AI-yet.** The wellbeing indicators, success metrics and early-warning
  triggers expose a structured, privacy-aware surface for the Institutional Intelligence
  program without building prediction here.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition root
  (TD-21). One growing package, acceptable for a cohesive bounded context (as with
  governance, student-lifecycle and family-guardian).
