# 23. Family & Guardian Intelligence Platform: one package, seven aggregates, families independent of students

- **Status:** Accepted
- **Date:** 2026-07-21
- **Contract:** P2-D04 (Family & Guardian Intelligence Platform)

## Context

Program: Student Lifecycle has delivered the learner model (P2-D03, ADR-0022) on the
certified `v0.2.0` Identity & Organization baseline and the Governance platform
(P2-D02, ADR-0021). P2-D04 is the second contract of the program: the authoritative
model of **families, guardianship, and the relationships, consent, emergency contacts
and communication that surround a learner**.

The contract's central premise is that **families are dynamic institutional
stakeholders, not attributes of a student record**. It defines a single deliverable
with seven aggregates (Family, Guardian, Student–Guardian Relationship, Consent,
Emergency Contact, Communication Profile, Family Intelligence Profile), eight domain
events, and hard rules: a family is **independent of Student**; a guardian supports
**many students** and a student **many guardians**; custody and legal authority are
**validated**; consent history is **immutable**; emergency contacts are **prioritized**.
It follows the domain architecture pattern (ADR-0010) on the certified core with no
frozen-code change, and consumes the P2-D03 Student and P2-D02 Policy platforms rather
than re-modelling them.

## Decision

1. **One domain package, `@knowget/family-guardian`, for all seven aggregates** — the
   same single-bounded-context choice as governance (ADR-0021) and student-lifecycle
   (ADR-0022). A shared spine (`errors.ts`, `ports.ts`, `family-guardian-events.ts`,
   `index.ts`) plus a per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`),
   with value objects (household member/role, family address, family status,
   communication channel, guardian contact, legal authority, verification status,
   guardian status, relationship type, responsibility profile, consent type, emergency
   authorization, contact-attempt, communication schedule, notification preference,
   family intelligence indicators, family interaction) as small sibling modules.

2. **Family is independent of Student; identity is linked, never duplicated.** The
   **Family** holds only household data — a family number, members, addresses, a primary
   contact, communication defaults and a merge/split/archive lifecycle — and carries
   **no student reference**. Household members and guardians are always a **Person**
   (`personId`). A learner enters the domain only through the **Student–Guardian
   Relationship**, which links a P2-D03 **Student** to a **Guardian**. Cross-domain
   existence (Person, Organization, Student, Policy) enters through injected **directory
   ports**, adapted at the composition root over the respective services; the pure
   package depends on none of them.

3. **Guardians and students are many-to-many, with validated custody.** The
   **Student–Guardian Relationship** is the join: a student may have many guardians and
   a guardian many students (neither reference is unique). It records the relationship
   type, independently-managed **legal / educational / financial responsibilities** and
   **pickup / medical authorizations**, an emergency priority and an effective period.
   **Custody validation** is enforced in the service: granting _legal_ responsibility
   requires the guardian to actually hold a **legal authority** (anything other than
   `none`). The relationship's organization is **derived from the guardian**, so the two
   can never disagree.

4. **Immutable, versioned consent ledger.** **Consent** is an append-only record — no
   update, no delete — the same immutable-ledger design as the policy-acknowledgment
   (ADR-0021) and student timeline (ADR-0022). Every grant or withdrawal writes a new,
   monotonically-versioned, timestamped row per `(student, consentType)` across the six
   consent types (academic, medical, media, excursion, technology, data-privacy).
   Current standing is the latest record (granted, in effect, unexpired). Consent may be
   **linked to a governance Policy** (P2-D02) through a directory port.

5. **Prioritized emergency contacts.** An **Emergency Contact** is a Person with a
   **priority unique per student** (the calling hierarchy), authorized actions (pickup /
   medical) and an **append-only contact history**. The service lists a student's
   contacts in priority order.

6. **Per-family communication and intelligence profiles.** The **Communication
   Profile** (preferred language, ordered channels, contact schedules, per-category
   notification levels, accessibility requirements) and the **Family Intelligence
   Profile** (AI-ready engagement indicators + an append-only institutional interaction
   timeline — **model and integration points only**, prediction deferred to the
   Institutional Intelligence program) are **one per family**, deriving their
   organization from the family they attach to.

7. **Persistence per ADR-0010.** Seven tables (`family`, `guardian`,
   `student_guardian_relationship`, `family_consent`, `emergency_contact`,
   `communication_profile`, `family_intelligence_profile`) with Prisma/RLS adapters at
   the `apps/api` composition root (TD-21). Every table has `ENABLE` + `FORCE ROW LEVEL
SECURITY` and the standard `tenant_isolation` policy, soft-delete and audit columns
   (the consent ledger excepted — append-only) — verified on live PostgreSQL. Absolute
   invariants have DB unique indexes (family number; guardian person+org; consent
   version per student+type; one communication and one intelligence profile per family);
   the two _status-scoped_ invariants (active relationship uniqueness; active
   emergency-priority per student) are service-enforced with a DB partial-unique backstop
   deferred (TD-26).

8. **Eight domain events on the platform bus** — `family.registered`,
   `family.guardian.registered`, `family.guardian.assigned`, `family.guardian.removed`,
   `family.consent.granted`, `family.consent.withdrawn`,
   `family.emergency_contact.updated`, `family.pickup_authorization.changed` — published
   from the owning service transitions through the optional `EventBus` seam.

9. **Permission-gated, tenant-scoped REST.** Seven controllers under
   `family-guardian/*`, gated by `family:read` / `family:write`, tenant-scoped through
   the principal, with zod-validated bodies. The `FamilyGuardianModule` wires the seven
   repositories, four directories and seven services, imports the Organization, Person,
   Student-Lifecycle and Governance modules, is registered in the root module, and
   **exports every service token** — future domains consume `FamilyService`,
   `GuardianService`, `ConsentService` rather than re-modelling families or guardians.

10. **Explicit non-goals.** No fee collection, parent-portal UI, student attendance,
    academic progress, messaging campaigns or CRM workflows — those belong to their own
    domains and integrate _with_ FGIP.

## Consequences

- **A unified family model.** Families, guardianship, consent, emergency contacts and
  communication are modelled once. Every domain that needs a guardian or a family
  consumes FGIP's services and events instead of duplicating them — the contract's
  definition of done.
- **Identity integrity.** Guardians and members exist once as a Person; learners are
  P2-D03 Students; nothing is duplicated. A family never references a student, so the
  family model is genuinely independent.
- **Real-world custody.** Legal, educational, financial and emergency responsibilities
  are independently managed and legal responsibility is authority-validated.
- **Auditability.** The consent ledger is immutable and versioned; the interaction and
  contact histories are append-only; every guardian assignment/removal and consent
  decision emits an event.
- **Isolation.** All seven tables are FORCE-RLS tenant-isolated and fail-closed, verified
  on live PostgreSQL.
- **AI-ready, not AI-yet.** The family intelligence profile exposes a structured,
  privacy-aware surface for the Institutional Intelligence program, without building
  prediction here.
- **Deferred, interface-protected.** Domain Prisma adapters remain at the composition
  root (TD-21). Consent granting is deliberately decoupled from guardian legal authority
  and the student relationship (TD-25). The two status-scoped uniqueness invariants are
  service-enforced, with DB partial-unique backstops deferred (TD-26). One growing
  package, acceptable for a cohesive bounded context (as with governance and
  student-lifecycle).
