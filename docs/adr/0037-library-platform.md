# 37. Knowledge Resource, Library & Digital Learning Asset: one package, eight aggregates, two pure engines, and no money

- **Status:** Accepted
- **Date:** 2026-12-19
- **Contract:** P2-D18 (Knowledge Resource, Library & Digital Learning Asset Platform)

## Context

P2-D18 is the seventh contract of **Program C** (the operational institution), on the certified `v0.2.0`
baseline, the frozen Phase-1 core, the P2-D01-M01 organization base and the P2-D01-M02 person base. It is
the authoritative domain for **the institution's library**: the catalog of titles it holds, the physical
copies of them on its shelves, the digital learning assets it licenses, the members entitled to borrow,
the loans and reservations that circulate the collection, the circulation policy that governs lending, and
the descriptive profile of the collection as a whole. It is a knowledge-resource peer of the operational
domains delivered before it (transport P2-D16, residential P2-D17): those manage how students travel and
where they live; this one manages what they read and learn from.

Two decisions shape the design. First, two quantities are **derived, not stored** — a title's
**availability** (its loanable copies against those on loan or lost, rolled to the collection utilization)
and a loan's **due date and overdue state** (from the issue date, the captured loan period and the
renewals used) — so, as with every operational domain, the design begins with the pure engines that
compute them, not with an aggregate. Second, and as with residential, **this domain carries no money.**
Overdue and lost-item fines belong to Finance (P2-D14), and the acquisition spend and asset valuation of
the collection belong to Procurement & Assets (P2-D15). Keeping money out entirely keeps this bounded
context purely operational and its dependencies minimal.

Two boundaries bound it. First, **prediction is not here** — demand forecasting, recommendation and
reading analytics are reserved for the **intelligence core (P2-D28)**; the collection profile is
descriptive and derived, never a forecast. Second, **identity is not here** — a title's organization is an
**Organization (P2-D01-M01)**, and a member is a **Person (P2-D01-M02)** — a student, staff member,
alumnus — each referenced by id and never re-modelled.

## Decision

1. **Two pure engines are the computational core, built and tested first.** `computeTitleAvailability`
   values a title's copies (total, available, on loan, lost) into whether it is available and whether it is
   reservable (no copy free but at least one loanable copy exists), and `computeCollectionUtilization`
   rolls the title views into a collection's on-loan-vs-loanable utilization percent.
   `computeLoanStatus` derives a loan's due date (`addDays(issueDate, loanPeriodDays × (1 + renewalsUsed))`),
   whether it is overdue and by how many days, and whether it can still be renewed. Both are pure,
   deterministic and **clock-free** (the caller passes the as-of date), and overdue is measured in **days,
   never money**.

2. **This domain has no money — a deliberate operational boundary.** Overdue and lost-item fines are billed
   by Finance (P2-D14); the acquisition cost and capital valuation of the collection are Procurement &
   Assets' (P2-D15). `@knowget/library` therefore imports no money core and defines no monetary field. Loan
   periods, renewal and borrowing limits, queue positions, holdings and circulation counts, utilization
   percents and versions are all **integers**.

3. **One domain package, `@knowget/library`, for all eight aggregates** — the same single-bounded-context
   choice as the sixteen prior domains (ADR-0021…0036). A shared spine (`errors.ts`, `ports.ts`,
   `library-events.ts`, `library-value.ts`, `library-view.ts`, `index.ts`), the two engines, and a
   per-aggregate pair (`<aggregate>.ts` + `<aggregate>-service.ts`).

4. **The title and its copies are the catalog masters.** A title is a work in the catalog (a book,
   journal, magazine, reference, media item or thesis) with an optional ISBN (unique per tenant), author
   and subject lists, and bibliographic metadata; it runs `active ↔ withdrawn`. A copy is a physical
   holding of a title tracked by a barcode (unique per tenant); it runs `available ↔ on_loan → lost |
withdrawn`, derives its organization from the title, and its status is what the availability engine
   reads. A copy on loan may only become lost through the loan (so the loan and the copy are reconciled
   together), never directly.

5. **A digital asset is a licensed digital learning resource.** It carries a format (ebook, audiobook,
   video, e-journal, courseware, dataset), an access model (open, licensed, subscription), an access
   reference and an optional licence expiry; it runs `active ↔ retired`. It has no physical copies and does
   not circulate — access validity is a derived, clock-free check against the licence expiry.

6. **A library member is a borrower, and a Person.** A member links a validated **Person (P2-D01-M02)** to
   an organization with a membership number (unique per tenant), a category (student/faculty/staff/alumni/
   guest) and an optional expiry; it runs `active ↔ suspended → expired`, with **one membership per person
   per organization**. Identity lives in the person domain and is never duplicated.

7. **A loan is a copy issued to a member, with its terms captured at issue.** It records the loan period
   and renewal limit **as resolved from the circulation policy at the moment of issue**, so the loan is
   decoupled from later policy changes; it runs `active → returned | lost`. Issue requires the copy to be
   available and enforces the member's **borrowing limit** (active loans against the limit); it flips the
   copy to `on_loan`, return flips it back to `available`, and loss loses the copy — the loan and copy move
   together. The due date and overdue state are **derived** by the engine, never stored, and **one active
   loan is allowed per copy**.

8. **A reservation is a member's hold on a title.** It carries a queue position (one past the highest open
   hold, so a cancellation cannot reuse a live position) and runs `requested → ready → fulfilled |
cancelled | expired`; the service requires an active title and member and enforces **one open
   reservation per member per title**. The organization is derived from the title.

9. **A circulation policy is the version-controlled lending rules.** It carries a default rule and a set of
   per-category rules (each a loan period, borrowing limit, renewal limit and hold-shelf days) and runs
   `draft → active → archived`; **rules are editable only while draft and frozen once active**, and **one
   policy is active per organization**. The policy is the single source of truth for lending terms:
   `resolveTermsForMember` reads the org's active policy and returns the terms for a member category, which
   the loan captures at issue.

10. **The collection profile is a descriptive read model, never a transaction.** One per organization, it
    carries the catalog and holdings counts (titles, copies, available/on-loan/lost), the circulation state
    (active/overdue loans, open reservations), the digital collection size and the utilization percent —
    all produced by the two pure engines over the organization's titles, copies, digital assets, loans and
    reservations, and **refreshed** (version-bumped) whenever those change. It is always derived, never
    posted to directly.

11. **Two permission scope pairs split the platform along its operational boundary.** `library:read`/
    `library:write` gate the knowledge collection itself — what the library holds and describes (titles,
    copies, digital assets, the collection profile), held by the cataloguing/collection team;
    `circulation:read`/`circulation:write` gate the lending relationship — who may borrow and the rules
    that govern it (members, loans, reservations, the circulation policy), held by the circulation desk.
    The two are separately administered, so they do not share a scope.

12. **Persistence per ADR-0010, no money.** Eight tables (`title`, `copy`, `digital_asset`,
    `library_member`, `loan`, `reservation`, `circulation_policy`, `collection_profile`) with Prisma/RLS
    adapters at the `apps/api` composition root (TD-21). Every table has `ENABLE` and `FORCE ROW LEVEL
SECURITY` and the standard `tenant_isolation` policy (both USING and WITH CHECK, fail-closed) — verified
    on live PostgreSQL. Loan periods, limits, queue positions, counts, percents and versions are
    **INTEGER**; a title's authors and subjects and the circulation policy's rules (per-category array +
    default rule object) are **JSONB**; date-only and ISO-stamp values (acquired/joined/issue/returned/
    requested/ready/refreshed stamps and licence expiry) are **TEXT**; the uniqueness rules (ISBN, barcode,
    membership number, one membership per (person, org), one profile per org) are tenant-scoped DB unique
    indexes (ISBN nullable, so untitled-by-ISBN copies coexist under Postgres' multi-NULL unique).

13. **Domain events on the platform bus** — title cataloged/renamed/authors-set/subjects-set/metadata-set/
    withdrawn/restored; copy accessioned/located/condition-set/lost/withdrawn/issued/returned; digital
    asset cataloged/renamed/access-set/licence-renewed/retired/reactivated; member registered/category-set/
    expiry-set/suspended/reinstated/expired; loan issued/renewed/returned/lost; reservation placed/ready/
    fulfilled/cancelled/expired; policy drafted/rules-set/default-set/activated/archived; collection
    refreshed.

14. **Cross-domain references enter through directory ports.** Organization (P2-D01-M01) and Person
    (P2-D01-M02) existence are validated on write; a title/copy/asset/member/policy attaches to an
    organization, and a member links to a person. The library domain links to those domains and never
    depends on their packages directly. Loan issue is composed at the API layer: the controller reads the
    member, resolves the terms from the member's organization active policy, and issues with them captured.

15. **Three status-scoped uniqueness invariants are service-enforced (TD-38).** "One active loan per copy",
    "one open reservation per member+title" and "one active circulation policy per organization" are
    enforced by a check-then-act in the services (there is no DB backstop, so a TOCTOU window exists under
    concurrency), whereas the domain's _absolute_ uniques (ISBN, barcode, membership number, membership per
    (person, org), profile per org) all have DB unique indexes. Partial unique indexes would close the
    window; recorded as **TD-38**.

16. **Explicit non-goals.** No fine billing or collection (Finance owns money), no acquisition spend or
    asset valuation (Procurement & Assets owns capital), no inter-library loan or union catalog, no digital
    rights enforcement or content delivery (the asset holds an access reference, not the bytes), no
    reading/recommendation analytics or demand forecasting — those are the intelligence core (P2-D28). This
    domain is the library system of record those build on.

## Consequences

- **A unified library system of record.** An institution manages its catalog, physical copies, digital
  assets, members, loans, reservations and lending policy in one place, on top of the organization and
  person bases, with a descriptive collection profile.
- **Availability and loan status are exact and consistent by construction.** A title's availability and a
  loan's due/overdue state are computed by pure engines from primary data (copy statuses; issue date, loan
  period and renewals), so every reader gets the same figure and nothing drifts from a stored copy.
- **The money boundary is held structurally.** With no monetary field anywhere in the domain, fines and
  acquisition spend cannot leak in — they stay in Finance and Procurement & Assets — and the domain's
  dependencies stay minimal.
- **Policy is the single source of lending terms, without coupling the loan to it.** The circulation policy
  resolves terms; the loan captures them at issue and is thereafter independent of policy edits, so a live
  loan's period cannot change under the borrower.
- **A pure, testable core.** The two engines are pure functions over narrow views — package tests exercise
  title availability and collection utilization, loan due-date/overdue/renewal math, every aggregate
  lifecycle, the borrowing-limit/uniqueness/edit guards, the copy-loss reconciliation, and an end-to-end
  policy → catalog → member → loan → reservation → collection-profile spine.
- **Isolation.** All eight tables are FORCE-RLS tenant-isolated and fail-closed, verified on live
  PostgreSQL with the JSONB (authors/subjects, policy rules), INTEGER (counts, periods) and nullable-ISBN
  columns round-tripping exactly; the uniqueness rules are tenant-scoped at the DB. Two independent
  adversarial audits (domain; persistence/API) were clean — the persistence/API audit across all
  categories, the domain audit on all critical/major items, with its one actionable finding fixed before
  merge.
- **Deferred, interface-protected.** Three status-scoped uniqueness invariants are service-enforced
  (**TD-38**); domain Prisma adapters remain at the composition root (TD-21). One cohesive package,
  acceptable for a single bounded context (as with the sixteen prior domains). This is the seventh contract
  of **Program C** and the library base the operational and intelligence-core domains build on.
