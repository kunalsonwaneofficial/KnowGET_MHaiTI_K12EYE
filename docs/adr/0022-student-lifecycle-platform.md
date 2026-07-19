# 22. Student Lifecycle Intelligence Platform: one package, six aggregates, Person/Membership-linked identity

- **Status:** Accepted
- **Date:** 2026-07-19
- **Contract:** P2-D03 (Student Lifecycle Intelligence Platform)

## Context

Phase 2 has delivered the Identity & Organization baseline (`v0.2.0`) and the
Institutional Governance Platform (P2-D02, ADR-0021). P2-D03 is the **highest
business domain**: the authoritative model of a learner's institutional journey,
from first enquiry through to alumnus. Every other academic domain — academics,
attendance, assessment, fees, and the rest — is required to **consume** this platform
rather than inventing its own student model.

The contract defines a single deliverable with six aggregates (Prospect, Applicant,
Student, Educational Journey, Intelligence Profile, Timeline), nine domain events, and
a hard rule that the platform must manage the whole funnel — prospect → applicant →
admitted → enrolled → active → on-leave → transferred/withdrawn/graduated → alumni —
**without redesign**, must keep student history **immutable and complete**, and must
link student identity **through Person and Membership, not duplicate it**. It follows
the domain architecture pattern (ADR-0010) on the certified core with no frozen-code
change.

## Decision

1. **One domain package, `@knowget/student-lifecycle`, for all six aggregates** — the
   same single-bounded-context choice as governance (ADR-0021 §1). A shared spine
   (`errors.ts`, `ports.ts`, `student-lifecycle-events.ts`, `index.ts`) plus a
   per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`), with value objects
   (lead source, document status, enrollment/academic/administrative status, journey
   event type, risk level, timeline entry type) as small sibling modules.

2. **Student is the central aggregate; identity is linked, never duplicated.** The
   learner is always a **Person** (`personId`); the enrolled student's institutional
   affiliation is a **Membership** (`membershipId`). Prospect and Applicant also
   reference a Person. The Student record carries only lifecycle data — student number,
   statuses, program/campus/section/academic-year assignment — never name or
   demographics. Cross-domain existence (Person, Organization, Membership) enters
   through injected **directory ports**, adapted at the composition root over the
   respective services; the pure package depends on none of them. The three
   student-scoped aggregates (journey, intelligence, timeline) **derive their
   organization from the student** they attach to, so the two can never disagree.

3. **The lifecycle as explicit, guarded state machines.** Three funnels — prospect
   (`new → contacted → qualified → converted | lost`), application (`draft → submitted
→ under_review → approved | rejected | withdrawn`, with an optional interview), and
   enrollment (`enrolled → active → on_leave → transferred | withdrawn | graduated →
alumni`) — each rejecting illegal transitions. Two Student invariants are enforced in
   the service: a **unique student number** (also backed by a DB unique index) and a
   **single active enrollment per institution**.

4. **Immutable, complete history.** The **Timeline** is an append-only permanent event
   log — no update, no delete, no soft-delete column — the same immutable-ledger design
   as the policy-acknowledgment table (ADR-0021). The **Educational Journey** is
   likewise append-only. The **Intelligence Profile** establishes the _model and
   integration points_ for AI-ready indicators (academic risk, attendance/behaviour
   trends, engagement, wellbeing) and the intervention history; prediction itself is
   explicitly deferred to the Institutional Intelligence program.

5. **Persistence per ADR-0010.** Six tables (`student_prospect`, `student_applicant`,
   `student`, `student_educational_journey`, `student_intelligence_profile`,
   `student_timeline_entry`) with Prisma/RLS adapters at the `apps/api` composition root
   (TD-21). Every table has `ENABLE` + `FORCE ROW LEVEL SECURITY` and the standard
   `tenant_isolation` policy, soft-delete and audit columns (the timeline excepted —
   append-only) — verified on live PostgreSQL.

6. **Nine domain events on the platform bus** — `student.prospect.created`,
   `student.application.submitted`, `student.applicant.approved`, and `student.enrolled`
   / `.promoted` / `.transferred` / `.withdrawn` / `.graduated` / `.became_alumni` —
   published from the owning service transitions through the optional `EventBus` seam.
   These are the foundation the downstream academic domains subscribe to.

7. **Permission-gated, tenant-scoped REST.** Six controllers under `student-lifecycle/*`
   (prospects, applications, students — enrollment/profile/lifecycle/search — journeys,
   intelligence, timeline), gated by `student:read` / `student:write`, tenant-scoped
   through the principal, with zod-validated bodies. The `StudentLifecycleModule` wires
   the six repositories, three directories and six services, is registered in the root
   module, and **exports every service token** — the point of the platform: future
   domains consume `StudentService`, `TimelineService`, `IntelligenceProfileService`
   rather than modelling students themselves.

8. **Explicit non-goals.** No attendance recording, timetable, examinations, fee
   collection, library circulation, transport routing, hostel allocation, or learning
   management — those belong to their own domains and integrate _with_ SLIP.

## Consequences

- **A unified learner model.** Identity, lifecycle, progression, intelligence and
  history are modelled once. Every academic domain consumes SLIP's services and events
  instead of duplicating a student model — the contract's definition of done.
- **Identity integrity.** A learner exists once as a Person; the student record links to
  it and to a Membership, so name/demographic data is never duplicated or forked, and a
  student's records can never disagree with the student on their organization.
- **Auditability.** The timeline is immutable and complete; the educational journey is
  append-only; every lifecycle transition is traceable and emits an event.
- **Isolation.** All six tables are FORCE-RLS tenant-isolated and fail-closed, verified
  on live PostgreSQL.
- **AI-ready, not AI-yet.** The intelligence profile exposes a structured, privacy-aware
  surface for the Institutional Intelligence program to consume later, without building
  prediction here.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition
  root (TD-21). The single-active-enrollment invariant is service-enforced; a DB partial
  unique index as a concurrency backstop is deferred (TD-24), behind the `StudentService`
  check. One growing package, acceptable for a cohesive bounded context (as with
  governance).
