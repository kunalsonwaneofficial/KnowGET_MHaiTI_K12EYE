# 43. Alumni, Community & Relationship: one package, eight aggregates, two pure engines, one immutable record, no money, and Program D closed

- **Status:** Accepted
- **Date:** 2026-12-25
- **Contract:** P2-D24 (Alumni, Community & Relationship Platform)

## Context

P2-D24 is **the sixth and final contract of Program D — Campus & Engagement** (D19–D24), on the certified
`v0.2.0` baseline, the frozen Phase-1 core, the P2-D01-M01 organization base and the P2-D01-M02 person base. It
is the authoritative domain for **how the institution keeps and grows its relationship with its alumni**: the
alumni-network profiles built on the alumnus lifecycle stage, the regional and interest chapters and their
memberships, the reunions and networking events and their registrations, the mentorship connections between
alumni, and the immutable giving record — with a descriptive per-alumnus engagement profile. It is the peer
that closes Program D, after the operational domains delivered before it (health-centre P2-D19, facilities
P2-D20, campus-security P2-D21, engagement P2-D22, admissions P2-D23): where admissions runs the funnel that
_brings students in_, this domain keeps the relationship _after they leave_.

The boundary with **Student Lifecycle (P2-D03)** is the defining decision, exactly as it was for admissions
(ADR-0042). P2-D03 owns the prospect → applicant → student → **alumnus** lifecycle **record**; the transition
that makes a student an alumnus is P2-D03's. This domain does **not** re-model it: an `AlumniProfile` is the
alumnus's **network membership**, referencing the alumnus as a **Person (P2-D01-M02)** and built on their
P2-D03 alumnus stage. Admissions ends where the student's lifecycle begins; this domain resumes where that
lifecycle _leaves the institution_ — both attach to the same Person, neither duplicates the lifecycle.

Three further decisions shape the design. First, several quantities are **derived, not stored** — an alumnus's
**engagement** (a score and level from their network activity) and an event's **participation** (fill and
attendance against capacity) — so, as with every operational domain, the design begins with the pure engines
that compute them, not with an aggregate. Second, **this domain carries no money** — a gift **amount is
Finance's (P2-D14)**; a contribution here records the _relationship fact_ (that an alumnus gave, at a
recognition tier), not the transaction. Third, **one of the eight aggregates is an immutable append-only
record**: a contribution is written once and never edited — a gift is a fact, and the giving log is exactly
what the engagement engine counts.

## Decision

1. **Two pure engines are the computational core, built and tested first.** The **engagement engine**
   (`computeAlumniEngagement`, `summarizeAlumniEngagement`): the first values an alumnus's engagement from
   their activity — a weighted, capped 0–100 score over attended events, active chapter memberships, active
   mentorships and contributions, and the level it falls in (inactive / casual / engaged / champion); the
   second rolls a set of engagements into a segment picture (count, average score, per-level distribution).
   The **participation engine** (`computeEventParticipation`, `summarizeParticipation`): the first values an
   event's fill against capacity, seats remaining, whether it is over-subscribed, and its attendance rate
   (attended against registered), with a **capacity of 0 meaning untracked/no cap**; the second rolls a set of
   events into a picture, **counting only capacity-tracked events toward the overall fill**. All are pure,
   deterministic and **clock-free** — a score is a **count-derived index**, a rate a **percent**, never money.

2. **One aggregate is an immutable append-only record.** A `Contribution` (an alumnus made a giving act — a
   pledge, gift, recurring commitment or in-kind donation — with a non-monetary recognition tier and an
   optional campaign reference) has no lifecycle and no edit or delete path (its repository omits `remove`). A
   correction is a new record. The contribution count is exactly one of the engagement engine's four signals.

3. **This domain has no money — giving is recorded, not transacted here.** `@knowget/alumni` imports no money
   core and defines no monetary field: engagement counts and score are **integers**; a **gift amount is
   Finance's (P2-D14)**. A contribution carries a **recognition tier** (supporter / patron / benefactor /
   founder), an input the institution records, never a derived-from-money value.

4. **One domain package, `@knowget/alumni`, for all eight aggregates** — the same single-bounded-context
   choice as the twenty-two prior domains (ADR-0021…0042). A shared spine (`errors.ts`, `ports.ts`,
   `alumni-events.ts`, `alumni-value.ts`, `alumni-view.ts`, `index.ts`), the two engines
   (`alumni-engagement.ts`, `participation.ts`), and a per-aggregate pair (`<aggregate>.ts` +
   `<aggregate>-service.ts`), plus the `alumni-engagement-profile-service.ts` integration spine.

5. **The alumni profile is the network-membership anchor.** An `AlumniProfile` references the alumnus as a
   Person, carries their graduation year and optional program, and runs `active ↔ lapsed → opted_out` (opting
   out is a terminal unsubscribe); **one profile per person per tenant**. The community aggregates (chapters,
   events, mentorship, contributions) attach to it, and its activity is what the engagement engine reads. The
   alumnus's lifecycle record stays in **Student Lifecycle (P2-D03)**.

6. **A chapter is a community; a membership is one row per (chapter, alumnus).** An `AlumniChapter` (regional /
   interest / class-year / professional, code unique per tenant) runs `forming → active ↔ inactive →
archived` and accepts members only while forming or active. A `ChapterMembership` runs `active → left` with
   `left → active` reactivation, and there is **one membership row per (chapter, alumni profile)** — a
   returning alumnus who left is **reactivated, not duplicated** — so the uniqueness is absolute and DB-backed,
   not status-scoped.

7. **An event is a gathering; a registration is one row per (event, alumnus).** An `AlumniEvent` (reunion /
   networking / webinar / fundraiser / volunteer, code unique per tenant, a capacity where 0 = untracked and a
   date window) runs `draft → scheduled → open → closed → completed | cancelled`, taking registrations only
   while open. An `EventRegistration` runs `registered → attended | no_show | cancelled` with `cancelled →
registered` reinstatement, and there is **one registration row per (event, alumni profile)** — a returning
   registrant is **reinstated, not duplicated**. A confirmed (non-cancelled) registration holds a seat; an
   attended one feeds the participation attendance rate and the alumnus's engagement.

8. **A mentorship is a relationship between two distinct alumni.** A `MentorshipConnection` (a mentor and a
   mentee, both alumni profiles, with an optional focus) runs `proposed → active → completed | ended`; the
   mentor and mentee must be distinct, and an active mentorship counts toward both alumni's engagement. A pair
   may hold more than one connection over time (no artificial uniqueness), so there is no unique constraint
   here.

9. **The engagement profile is a descriptive read model, never a transaction.** One per alumni profile, an
   `AlumniEngagementProfile` snapshots the engagement engine's output (the four activity counts, the score and
   the level), **refreshed** (overwritten) whenever the picture changes; every field is derived and
   re-derivable, so it holds no truth of its own. It is always derived, never posted to directly, and **never
   a forecast** (P2-D28).

10. **The engagement-profile refresh is the integration spine.** `AlumniEngagementProfileService.refreshForAlumnus`
    gathers an alumnus's attended registrations, active chapter memberships, active mentorships and
    contributions, values their engagement with `computeAlumniEngagement`, and upserts the one profile per
    alumnus, publishing the refreshed event. Live read helpers (`engagementForAlumnus`, `eventParticipation`)
    derive engagement and event participation on demand without persisting. A pure aggregation of primary data.

11. **Two permission scope pairs split the platform along its surface.** `alumni:read`/`alumni:write` gate the
    **individual relationship surface** (profiles, mentorships, contributions, the engagement profile);
    `community:read`/`community:write` gate the **community surface** (chapters, memberships, events,
    registrations). The two are separately administered, so they do not share a scope. Nothing is billed here.

12. **Persistence per ADR-0010, no money.** Eight tables (`alumni_profile`, `alumni_chapter`,
    `chapter_membership`, `alumni_event`, `event_registration`, `mentorship_connection`, `contribution`,
    `alumni_engagement_profile`) with Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every
    table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and the standard `tenant_isolation` policy (both USING
    and WITH CHECK, fail-closed) — verified on live PostgreSQL. An event capacity and every engagement count
    and the score are **INTEGER**; every date/ISO stamp and every code, name, type, role, region, status, tier
    and focus is **TEXT**.

13. **All of the domain's uniqueness invariants are absolute and DB-backed.** One profile per (tenant, alumnus
    person); chapter and event code per tenant; **one membership per (chapter, alumni profile)**; **one
    registration per (event, alumni profile)**; one engagement profile per alumni profile — each a DB unique
    index. Because the two "one row per pair" aggregates **reactivate the existing row** on return rather than
    inserting a second, there is **no status-scoped "one active X per Y" check-then-act guard here**, so this
    domain does **not** carry the TOCTOU debt of D16–D20 (TD-36…TD-40); like P2-D21, P2-D22 and P2-D23, every
    uniqueness rule is absolute and DB-backed.

14. **Domain events on the platform bus carry no money, no free text and no PII** — profile created / updated /
    lapsed / reactivated / opted-out; chapter created / renamed / type-set / region-set / activated /
    deactivated / archived; membership joined / role-set / left / reactivated; event created / renamed /
    type-set / capacity-set / window-set / scheduled / opened / closed / completed / cancelled; registration
    registered / attended / no-show / cancelled / reinstated; mentorship proposed / activated / completed /
    ended; contribution recorded; engagement profile refreshed. Payloads carry ids, codes, types, roles, tiers,
    statuses, scores and counts only — **never a person name, a graduation year, a chapter/event name, a
    mentorship focus, a campaign reference, or a gift amount**.

15. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01) and Person
    (P2-D01-M02, the alumnus) existence are validated on write; a membership and a registration derive their
    org from the chapter / event, a contribution and a mentorship from the alumni profile. The alumni domain
    links to those domains and never depends on their packages directly.

16. **Event capacity is advisory, not enforced (TD-44).** `EventRegistrationService.register` does **not**
    reject a registration when a tracked event's confirmed registrations reach or exceed its `capacity`. The
    participation engine _derives_ an `overSubscribed` / `remaining` signal (surfaced on the event
    participation view) for monitoring, but the write path does not block — **deliberate**, because alumni
    events routinely over-register against expected melt and often maintain waitlists, and a capacity of 0
    means untracked/no limit. A hard cap is therefore offered as an **opt-in** refinement behind the service,
    not a default. Recorded as **TD-44** (mirrors TD-41 and TD-43, the advisory-capacity family).

17. **Explicit non-goals.** No money — gift amounts are Finance's (P2-D14); no prospect/applicant/student/
    alumnus lifecycle record (Student Lifecycle, P2-D03, which the alumni profile is built on); no community
    message delivery (notifications P1-M05 / engagement P2-D22 — this domain records the event and the
    registration, not the invitation send); and no prediction — giving-propensity scoring, engagement
    forecasting and next-best-action are the intelligence core (P2-D28). This domain is the operational alumni
    system of record those build on.

## Consequences

- **A unified alumni-and-community system of record.** An institution runs its alumni profiles, chapters,
  memberships, events, registrations, mentorships, contributions and per-alumnus engagement profile in one
  place, on top of the organization and person bases, with engagement and participation derived from primary
  data.
- **Engagement and participation are exact and consistent by construction.** An alumnus's engagement and an
  event's fill/attendance are computed by pure engines from the underlying activity, so every reader gets the
  same figure and nothing drifts from a stored copy; the score is capped and the fill counts only tracked
  events.
- **The Student-Lifecycle boundary is held.** The alumnus's lifecycle record stays in P2-D03; this domain
  models only the network membership on top of it, so it never duplicates or drifts from the lifecycle. With
  admissions (P2-D23) and alumni (P2-D24) both attaching to P2-D03, the learner's whole arc — enquiry to
  alumnus — is one Person, never re-modelled.
- **The money boundary is held structurally.** With no monetary field anywhere, nothing financial can leak in;
  gift amounts stay in Finance (P2-D14).
- **The record is write-once.** A contribution is immutable and append-only, so the engagement engine always
  counts recorded facts and a gift can never be silently rewritten.
- **Returning alumni reactivate, never duplicate.** A membership and a registration are one row per pair;
  rejoining a chapter or re-registering for an event reactivates the existing row, so the DB uniques hold and
  there is no status-scoped TOCTOU debt.
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests exercise the
  engagement score (weights, cap, level bands, empty/negative) and its rollup, the event participation
  (untracked/over-subscribed/attendance) and its tracked-only rollup, every aggregate lifecycle (including the
  terminal-state and reactivation guards), the immutable contribution, the service validations (open-event /
  joinable-chapter / distinct-mentor gates, the one-row-per-pair reactivation, org derivation, existence
  checks), the money-free / free-text-free / PII-free content of every event, and an end-to-end profile →
  chapters / events / mentorships / contributions → engagement-profile spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live PostgreSQL
  with the INTEGER and TEXT columns round-tripping exactly, a cross-tenant INSERT rejected, and every business
  unique (one profile per person, chapter/event code, one membership per pair, one registration per pair, one
  engagement profile per alumnus) rejecting duplicates (SQLSTATE 23505). Two independent adversarial audits
  (domain; persistence/API) were run — both **clean of functional defects**; two low-severity design notes
  (a requested role dropped on chapter rejoin; the participation rollup blending tracked and untracked
  capacity) were polished before merge with regression tests.
- **Deferred, interface-protected.** Event capacity is advisory (**TD-44**, an opt-in hard cap deferred);
  domain Prisma adapters remain at the composition root (TD-21). One cohesive package, acceptable for a single
  bounded context (as with the twenty-two prior domains). Like P2-D21, P2-D22 and P2-D23 and unlike D16–D20,
  this domain carries **no status-scoped uniqueness TOCTOU debt** — every uniqueness rule is absolute and
  DB-backed. This is the **sixth and final contract of Program D**, which is now complete; the operational base
  (D01–D24) is the foundation the intelligence core (Program E, D25–D30) builds on.
