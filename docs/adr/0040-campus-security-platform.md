# 40. Campus Security, Safety & Visitor: one package, eight aggregates, two pure engines, an immutable door log, and no money

- **Status:** Accepted
- **Date:** 2026-12-22
- **Contract:** P2-D21 (Campus Security, Safety & Visitor Platform)

## Context

P2-D21 is **the third contract of Program D — Campus & Engagement** (D19–D24), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the P2-D01-M01 organization base, the P2-D01-M02 person base and the
P2-D12 workforce base. It is the authoritative domain for **the physical security and safety of the campus
and the people on it**: the security zones the campus is divided into, the visitors who come to it and their
visits, the access credentials that open zones and the immutable log of every access decision, the security
incidents raised across the estate, the emergency drills that rehearse evacuation and account for who is
present, and the descriptive per-zone safety profile. It is a peer of the operational domains delivered
before it (residential P2-D17, library P2-D18, health-centre P2-D19, facilities P2-D20): those manage where
students live, what they read, the care they receive and the built environment they occupy; this one manages
**who may enter, who is present, and how the institution keeps them safe**.

The name is deliberate. This domain is `@knowget/campus-security`, **not** `@knowget/security` — the latter is
the platform's cryptographic and RBAC foundation (P1-M04). This is the operational, institutional security of
a physical campus (zones, visitors, credentials, incidents, drills), an entirely different bounded context,
and its events ride a distinct `campus-security.*` namespace so the two never collide.

Three decisions shape the design. First, several quantities are **derived, not stored** — a zone's live
**presence** (who is checked in against its safe-occupancy capacity, and whether it is over capacity), a
drill's **muster status** (the safety-critical unaccounted-for count against the expected roster), and an
**access decision** (granted or denied, with a reason, from a credential's status, granted zones and expiry
against a zone's status) — so, as with every operational domain, the design begins with the pure engines that
compute them, not with an aggregate. Second, **this domain carries no money** — there is nothing to bill or
buy here; security-service procurement is Procurement & Assets' (P2-D15) and any charge is Finance's
(P2-D14). Third, and distinctively, one aggregate is **immutable append-only telemetry**: an access event is
a single decision recorded at a reader at a moment that, once written, never changes — a correction is a new
event, never an edit — and the log is what the access-activity engine summarizes.

Two boundaries bound it. First, and definingly, **the standing safeguarding record is not here** — a
student's disciplinary history, safeguarding concerns, protection plans and pastoral alerts belong to
**Learner Wellbeing (P2-D05)**. This domain owns the **operational security event** (an incident is a
time-bounded occurrence with a lifecycle — reported → triaged → investigating → resolved → closed — not a
standing record about a person); where an incident touches a child-protection concern, that concern is
raised and held in Learner Wellbeing. Second, **the clinical incident is not here** — a medical emergency,
an injury or a health event on campus is the **Health Centre's (P2-D19)** clinical encounter; a security
incident records a security occurrence (an intrusion, a theft, a lockdown), never a diagnosis. Identity is
referenced, not re-modelled: a zone's and a visitor's organization is an **Organization (P2-D01-M01)**, a
visit's host and an incident's reporter are a **Person (P2-D01-M02)**, and an incident's assignee, a drill's
conductor and an employee credential-holder are an **Employee (P2-D12)**.

## Decision

1. **Two pure engines are the computational core, built and tested first.** The **presence engine**
   (`computeZonePresence`, `summarizeSitePresence`, `computeMusterStatus`): the first values a zone's live
   on-site count (its checked-in visits) against its safe-occupancy capacity — how many are present, how many
   places remain, whether it is over capacity, and an occupancy percent (a capacity of zero means
   "not capacity-tracked": no limit, available zero, over-capacity false); the second rolls a set of zone
   presences into a campus picture (zone count, total headcount, total capacity); the third reconciles a
   drill's expected roster against the accounted-for headcount into the **safety-critical unaccounted-for
   number** (never negative), whether all are accounted for, and a completion percent (capped at 100). The
   **access engine** (`evaluateAccess`, `summarizeAccessActivity`): the first decides a credential's access
   to a zone by strict priority (credential inactive → expired → zone unavailable → zone locked down → zone
   not granted → ok), the second tallies a log of access events into granted/denied counts. All are pure,
   deterministic and **clock-free** — presence is a **headcount**, muster an **unaccounted-for count**,
   access a **decision**, never money.

2. **The access decision compares a date-only expiry against an as-of date, defaulting to the DATE of the
   moment it occurred.** `evaluateAccess` treats a credential's `expiresOn` as date-only and expires it only
   strictly after that date; the decision spine defaults its as-of date to the **date portion** of the
   event's timestamp (`occurredAt.slice(0, 10)`), so a credential is granted through the end of its own
   expiry day and denied the day after — never falsely expired at a timestamped moment on the expiry date
   itself.

3. **This domain has no money — a deliberate boundary.** There is no billing or purchasing here;
   security-service procurement is Procurement & Assets' (P2-D15) and any charge is Finance's (P2-D14).
   `@knowget/campus-security` imports no money core and defines no monetary field: capacities, counts, drill
   rosters and musters, occupancy and completion percents, and access-activity tallies are all **integers**;
   nothing is a currency amount.

4. **One aggregate is an immutable append-only door log.** An `AccessEvent` is a single access decision
   (granted/denied + reason) recorded against a credential at a zone at a moment; it has no lifecycle and no
   edit or delete path (its repository deliberately omits `remove`). The log feeds the access-activity engine
   and the safety profile's granted/denied counts. This is the one high-volume, write-once table in the
   domain.

5. **One domain package, `@knowget/campus-security`, for all eight aggregates** — the same
   single-bounded-context choice as the nineteen prior domains (ADR-0021…0039). A shared spine (`errors.ts`,
   `ports.ts`, `campus-security-events.ts`, `campus-security-value.ts`, `campus-security-view.ts`,
   `index.ts`), the two engines (`presence.ts`, `access.ts`), and a per-aggregate pair (`<aggregate>.ts` +
   `<aggregate>-service.ts`), plus the `access-decision-service.ts` integration spine.

6. **The access zone and the visitor are the two masters.** An **access zone** is a securable area with a
   code (unique per tenant), a name, a security level (public / restricted / secure / high_security) and a
   safe-occupancy capacity; it runs `active ↔ locked_down → decommissioned`, and a decommissioned zone is
   terminal. A **visitor** is a person who comes to the campus with a code (unique per tenant), a name, a
   type (parent / vendor / contractor / guest / official / …) and optional contact details; it runs
   `active ↔ blocked → archived`, and a blocked or archived visitor cannot have a visit requested or
   approved. Both attach to an **Organization**, validated on write.

7. **A visit is the visitor's time-bounded presence, driven through a check-in lifecycle.** A visit links a
   visitor to a host **Person** and, optionally, a destination zone, with a scheduled time; it runs
   `requested → approved → checked_in → checked_out`, with `denied` from requested, `cancelled` from an
   unstarted state and `expired` for an approved-but-never-arrived visit. Its organization is derived from
   the visitor. Only a **checked-in** visit counts toward a zone's live presence. A blocked visitor cannot
   be requested or approved (re-checked at approval, not only at request).

8. **An access credential opens zones for a holder, and drives a suspend/revoke lifecycle.** A credential has
   a number (unique per tenant), a holder — an **Employee**, a **Person** or a **Visitor**, its existence
   validated by type — a de-duplicated set of granted zone ids, an issue date and an optional expiry; it runs
   `active ↔ suspended → revoked`. Issuing validates the organization, the holder and **every granted zone**;
   granting a zone validates it exists. The engine, not the aggregate, decides access.

9. **A security incident is the operational security event log.** An incident raised against an organization
   and, optionally, a location zone (which must belong to that org) and a reporter **Person**, with a code
   (unique per tenant), a category, a severity (low / medium / high / critical) and a short summary; it runs
   `reported → triaged → investigating → resolved → closed`, with `cancelled` from any open state and **an
   Employee assignee required before investigation starts**. It records a **security occurrence** — never a
   standing safeguarding record (Learner Wellbeing, P2-D05) and never a clinical event (Health Centre,
   P2-D19).

10. **An emergency drill rehearses evacuation and accounts for who is present; the muster is the spine's
    safety output.** A drill of a type (fire / lockdown / evacuation / …) against an organization and an
    optional zone, with a code (unique per tenant), an expected roster and, once run, an accounted-for
    headcount; it runs `scheduled → in_progress → completed`, with `cancelled` from an open state, and an
    optional **Employee** conductor. Its **muster status** — the unaccounted-for count — is **derived** by
    the presence engine, never stored: the emergency-drill analog of the residential roll-call.

11. **The safety profile is a descriptive read model, never a transaction.** One per zone, it carries the
    zone's live presence (from the presence engine over its on-site visits), its over-capacity flag, and its
    counts of open incidents, active credentials and granted/denied access events (from the access-activity
    engine), **refreshed** (overwritten) whenever the picture changes; every field is derived and
    re-derivable, so it holds no truth of its own. It is always derived, never posted to directly, and
    **never a forecast** (P2-D28).

12. **The access decision is the integration spine.** `AccessDecisionService.decide` resolves the credential
    and the zone, runs the pure access engine over the credential's status / granted zones / expiry against
    the zone's status (as of the date the event occurred), appends the resulting decision to the immutable
    access log, and publishes the access-recorded event. It records **what a reader should decide** — the
    platform is the system of record; edge-device door control is out of scope (a non-goal, below).

13. **Two permission scope pairs split the platform along its access boundary.** `security:read`/
    `security:write` gate the **institutional security surface** (zones, credentials, the access decision and
    its log, incidents, drills, the per-zone safety profile), held by the security function;
    `visitor:read`/`visitor:write` gate the **visitor surface** (visitors and their visits), administered by
    front-desk / reception. The two are separately administered, so they do not share a scope. Nothing is
    billed here; nothing is gated on money.

14. **Persistence per ADR-0010, no money.** Eight tables (`access_zone`, `visitor`, `visit`,
    `access_credential`, `access_event`, `security_incident`, `emergency_drill`, `safety_profile`) with
    Prisma/RLS adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE ROW
LEVEL SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) —
    verified on live PostgreSQL. Capacities, counts, drill rosters/musters and percents are **INTEGER**; a
    credential's granted zone ids are **JSONB**; a zone's over-capacity flag on the profile is **BOOLEAN**;
    every date-only and ISO-stamp value (scheduled / checked-in / checked-out / issued / expires / occurred /
    reported / resolved / started / completed / refreshed stamps), and every code, name and free-text
    summary, is **TEXT**. Uniqueness is tenant-scoped at the DB: zone, visitor, credential, incident and
    drill codes per tenant, one profile per zone. **All of the domain's uniqueness invariants are absolute
    and DB-backed** — there is no status-scoped "one active X per Y" check-then-act guard here (the access
    log is append-only; a visitor may hold several visits; a zone many credentials), so this domain does
    **not** carry the TOCTOU debt of D16–D20 (TD-36…TD-40).

15. **Domain events on the platform bus carry no money, no free text and no PII** — zone created / renamed /
    security-level-set / capacity-set / locked-down / lockdown-lifted / decommissioned; visitor registered /
    type-set / contact-updated / blocked / unblocked / archived; visit requested / zone-set / approved /
    denied / checked-in / checked-out / cancelled / expired; credential issued / zone-granted / zone-revoked /
    expiry-set / suspended / reinstated / revoked; access recorded; incident reported / triaged / assigned /
    severity-set / investigation-started / resolved / closed / cancelled; drill scheduled / expected-set /
    started / muster-recorded / completed / cancelled; safety profile refreshed. Payloads carry ids, codes,
    types, levels, statuses, severities, decisions, reasons and counts only — **never a visitor's name or
    contact details, and never an incident's free-text summary**.

16. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01), Person (P2-D01-M02,
    the visit hosts and incident reporters) and Employee (P2-D12, the incident assignees, drill conductors
    and employee credential-holders) existence are validated on write; a visit derives its org from the
    visitor, a zone/incident/drill attaches to an organization, and a location zone on an incident/drill is
    checked to belong to that organization. The campus-security domain links to those domains and never
    depends on their packages directly.

17. **Zone occupancy capacity is advisory, not enforced (TD-41).** The presence engine derives an
    `overCapacity` signal (surfaced on the zone-presence view and the safety profile's `over_capacity` flag)
    for monitoring, but the visit check-in path does not reject a check-in when a zone is at or over
    capacity. This is deliberate — a physical-safety system must record a person who is actually present and
    must never impede egress — so a hard occupancy cap is an **opt-in** refinement behind `VisitService`,
    not a default. Recorded as **TD-41**.

18. **Explicit non-goals.** No standing safeguarding / disciplinary / child-protection record (Learner
    Wellbeing, P2-D05, owns it — a security incident is a time-bounded occurrence, not a standing record
    about a person), no clinical incident, injury or medical emergency (Health Centre, P2-D19 — a security
    incident is not a clinical encounter), no physical door-controller / reader / turnstile firmware or
    real-time device protocol (access decisions enter and are recorded through the API; edge enforcement is
    out of scope), no CCTV / video management, no security-service billing or procurement (Finance P2-D14 /
    Procurement & Assets P2-D15), and no prediction — threat scoring, anomaly detection on the access log and
    risk forecasting are the intelligence core (P2-D28). This domain is the operational campus-security
    system of record those build on.

## Consequences

- **A unified campus-security system of record.** An institution runs its zones, visitors, visits, access
  credentials, access log, security incidents, emergency drills and per-zone safety profile in one place, on
  top of the organization, person and workforce bases, with a live presence picture and a campus rollup.
- **Presence, muster and access decisions are exact and consistent by construction.** A zone's occupancy, a
  drill's unaccounted-for count and a credential's access to a zone are computed by pure engines from primary
  data, so every reader gets the same figure and nothing drifts from a stored copy.
- **The money boundary is held structurally.** With no monetary field anywhere, no billing or procurement can
  leak in — it stays in Finance and Procurement & Assets.
- **The safeguarding and clinical boundaries are held structurally.** A security incident is a time-bounded
  operational occurrence with its own lifecycle; it cannot become a standing safeguarding record (Learner
  Wellbeing) or a clinical encounter (Health Centre), so the domain cannot duplicate or drift from either.
- **The access log is write-once.** Access events are immutable and append-only, so the activity engine
  always summarizes recorded facts and a decision can never be silently rewritten.
- **No false expiry at the boundary.** Because the engine compares a date-only expiry against the date of the
  decision, a credential is honoured through the whole of its expiry day and denied the day after — a bug
  caught and fixed under adversarial audit before merge.
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests exercise
  zone presence (including the not-capacity-tracked and over-capacity cases), the site rollup, the muster
  unaccounted-for count and completion percent, the access decision at every priority (inactive / expired /
  unavailable / locked-down / not-granted / ok) including the expiry-day boundary, the access-activity tally,
  every aggregate lifecycle (including the terminal-state freezes and the assignee-before-investigation
  guard), the money-free / free-text-free / PII-free content of every event, and an end-to-end zone →
  credential → access-decision → log → profile and visitor → visit → presence spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live PostgreSQL
  with the INTEGER, JSONB, BOOLEAN and TEXT columns round-tripping exactly and a cross-tenant INSERT rejected
  (SQLSTATE 42501); the uniqueness rules are tenant-scoped at the DB. Two independent adversarial audits
  (domain; persistence/API) were run — the persistence/API audit clean across all categories, the domain
  audit with two consistency findings both fixed before merge (the date-vs-timestamp expiry default in the
  access-decision spine; the missing organization validation in credential issuance).
- **Deferred, interface-protected.** Zone occupancy capacity is advisory, a hard cap left as an opt-in behind
  the service (**TD-41**); domain Prisma adapters remain at the composition root (TD-21). One cohesive
  package, acceptable for a single bounded context (as with the nineteen prior domains). Unlike D16–D20 this
  domain carries **no status-scoped uniqueness TOCTOU debt** — all its uniqueness is absolute and DB-backed.
  This is the third contract of **Program D** and the operational campus-security base the engagement and
  intelligence-core domains build on.
