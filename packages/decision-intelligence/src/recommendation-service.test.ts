import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import type { EvidenceSource } from "./decision-value";
import {
  EvidenceRetractionUngroundsError,
  EvidenceSourceNotFoundError,
  OrganizationNotFoundForDecisionError,
  RecommendationNotFoundError,
  RecommendationNotOpenError,
} from "./errors";
import { InMemoryRecommendationRepository } from "./ports";
import { type CreateRecommendationParams, citeEvidence } from "./recommendation";
import { RecommendationService } from "./recommendation-service";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;
const MISSING_ORG = "org-404" as Uuid;

/** Every organization exists except the one named to test that the check is actually made. */
const organizations = {
  async exists(_tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    return organizationId !== MISSING_ORG;
  },
};

/** Every cited record exists except refs beginning `ghost-`. */
const evidenceSources = {
  async exists(_tenantId: TenantId, _source: EvidenceSource, ref: string): Promise<boolean> {
    return !ref.startsWith("ghost-");
  },
};

const strong = (ref = "entity-8812") =>
  citeEvidence({ source: "knowledge_graph", ref, strength: "strong" });

describe("RecommendationService", () => {
  let repository: InMemoryRecommendationRepository;
  let published: DomainEvent[];
  let svc: RecommendationService;

  beforeEach(() => {
    repository = new InMemoryRecommendationRepository();
    published = [];
    svc = new RecommendationService({
      repository,
      organizations,
      evidenceSources,
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const raise = async (patch: Partial<CreateRecommendationParams> = {}) =>
    svc.raise({
      tenantId: TENANT,
      organizationId: ORG,
      title: "Contact the guardian about a fifth consecutive absence",
      subjectDomain: "attendance",
      subjectId: "student-4471",
      impactBand: "individual",
      riskLevel: "medium",
      evidence: [strong()],
      ...patch,
    });

  // --- Raising ---------------------------------------------------------------------

  it("raises a proposal on a chain that grounds it, and announces it", async () => {
    const recommendation = await raise();

    expect(recommendation.status).toBe("proposed");
    expect(recommendation.evidence).toHaveLength(1);
    expect(await repository.findById(TENANT, recommendation.id)).toEqual(recommendation);
    expect(published.map((event) => event.type)).toEqual(["decision.recommendation.raised"]);
  });

  it("refuses a recommendation hung off an organization that is not there", async () => {
    await expect(raise({ organizationId: MISSING_ORG })).rejects.toThrow(
      OrganizationNotFoundForDecisionError,
    );
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  /**
   * The contract's second rule, at the door it is actually broken at. A chain of references to records that do
   * not exist passes every structural check the aggregate can make and satisfies none of the point — whoever is
   * asked to act on it finds out only when they go looking.
   */
  it("refuses a citation of something that is not there, and writes nothing at all", async () => {
    await expect(raise({ evidence: [strong("ghost-1")] })).rejects.toThrow(
      EvidenceSourceNotFoundError,
    );
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(published).toEqual([]);
  });

  it("checks every link in the chain, not merely the first", async () => {
    await expect(raise({ evidence: [strong(), strong("ghost-2")] })).rejects.toThrow(
      EvidenceSourceNotFoundError,
    );
  });

  // --- Evidence --------------------------------------------------------------------

  it("cites one more thing on an open recommendation once the thing is found", async () => {
    const raised = await raise();
    const cited = await svc.cite(TENANT, raised.id, {
      source: "reasoning_session",
      ref: "session-3310",
      strength: "moderate",
    });

    expect(cited.evidence).toHaveLength(2);
    expect(published.map((event) => event.type)).toEqual([
      "decision.recommendation.raised",
      "decision.recommendation.evidence_added",
    ]);
  });

  it("refuses to cite a record that cannot be found, leaving the chain as it was", async () => {
    const raised = await raise();

    await expect(
      svc.cite(TENANT, raised.id, {
        source: "knowledge_graph",
        ref: "ghost-9",
        strength: "strong",
      }),
    ).rejects.toThrow(EvidenceSourceNotFoundError);
    expect((await svc.get(TENANT, raised.id)).evidence).toHaveLength(1);
  });

  it("takes a citation back, and refuses the one that would hollow the chain out", async () => {
    const raised = await raise({ evidence: [strong("entity-1"), strong("entity-2")] });
    const first = raised.evidence[0];
    const second = raised.evidence[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const retracted = await svc.retract(TENANT, raised.id, first?.id ?? "");
    expect(retracted.evidence).toHaveLength(1);

    await expect(svc.retract(TENANT, raised.id, second?.id ?? "")).rejects.toThrow(
      EvidenceRetractionUngroundsError,
    );
  });

  // --- Answering -------------------------------------------------------------------

  it("records a named person agreeing, disagreeing, or taking it back", async () => {
    const accepted = await svc.accept(TENANT, (await raise()).id, {
      resolvedByUserId: "user-6602",
    });
    const rejected = await svc.reject(TENANT, (await raise()).id, {
      resolvedByUserId: "user-6602",
    });
    const withdrawn = await svc.withdraw(TENANT, (await raise()).id, {
      resolvedByUserId: "user-6602",
    });

    expect([accepted.status, rejected.status, withdrawn.status]).toEqual([
      "accepted",
      "rejected",
      "withdrawn",
    ]);
    expect(published.map((event) => event.type)).toContain("decision.recommendation.accepted");
    expect(published.map((event) => event.type)).toContain("decision.recommendation.withdrawn");
  });

  it("refuses a second answer to a question already answered", async () => {
    const raised = await raise();
    await svc.accept(TENANT, raised.id, { resolvedByUserId: "user-6602" });

    await expect(svc.reject(TENANT, raised.id, { resolvedByUserId: "user-9" })).rejects.toThrow(
      RecommendationNotOpenError,
    );
  });

  /**
   * A superseded recommendation naming a successor that does not exist is a dead end in the institution's
   * memory, which is exactly what recording the successor was meant to prevent.
   */
  it("loads the successor rather than taking it on trust", async () => {
    const original = await raise();
    const successor = await raise({ subjectId: "student-4471" });

    const superseded = await svc.supersede(TENANT, original.id, successor.id);
    expect(superseded.status).toBe("superseded");
    expect(superseded.supersededById).toBe(successor.id);

    await expect(svc.supersede(TENANT, successor.id, "nobody-1" as Uuid)).rejects.toThrow(
      RecommendationNotFoundError,
    );
  });

  // --- The sweep -------------------------------------------------------------------

  /**
   * The only path by which a recommendation settles with nobody behind it. The instant is supplied rather than
   * read from a clock, so an operator can ask what *would* lapse by a given moment without anything moving.
   */
  it("expires everything whose window closed, and leaves everything else standing", async () => {
    const lapsing = await raise({ expiresAt: "2026-01-01T00:00:00.000Z" as ISODateString });
    const open = await raise({ expiresAt: "2027-01-01T00:00:00.000Z" as ISODateString });
    const endless = await raise();

    const expired = await svc.expireLapsed(TENANT, "2026-06-01T00:00:00.000Z" as ISODateString);

    expect(expired.map((r) => r.id)).toEqual([lapsing.id]);
    expect((await svc.get(TENANT, open.id)).status).toBe("proposed");
    expect((await svc.get(TENANT, endless.id)).status).toBe("proposed");
    expect(published.filter((e) => e.type === "decision.recommendation.expired")).toHaveLength(1);
  });

  it("sweeps nothing when nothing has lapsed", async () => {
    await raise({ expiresAt: "2027-01-01T00:00:00.000Z" as ISODateString });

    expect(await svc.expireLapsed(TENANT, "2026-06-01T00:00:00.000Z" as ISODateString)).toEqual([]);
  });

  // --- Reading ---------------------------------------------------------------------

  it("reads only inside the tenant asked about", async () => {
    const mine = await raise();
    await raise({ tenantId: OTHER });

    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(await svc.listOpen(OTHER)).toHaveLength(1);
    expect(await svc.listBySubject(TENANT, "attendance", "student-4471")).toEqual([mine]);
    await expect(svc.get(OTHER, mine.id)).rejects.toThrow(RecommendationNotFoundError);
  });

  it("ranks the open backlog rather than merely listing it", async () => {
    const urgent = await raise({ impactBand: "institution", riskLevel: "high" });
    await raise({ impactBand: "individual", riskLevel: "low", subjectId: "student-9930" });
    await svc.accept(TENANT, (await raise({ subjectId: "student-2214" })).id, {
      resolvedByUserId: "user-6602",
    });

    const ranked = await svc.prioritized(TENANT, "2026-06-01T00:00:00.000Z" as ISODateString);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.id).toBe(urgent.id);
  });

  it("works without an event bus at all", async () => {
    const quiet = new RecommendationService({ repository, organizations, evidenceSources });
    const recommendation = await quiet.raise({
      tenantId: TENANT,
      organizationId: ORG,
      title: "Review the transport route after a third late arrival",
      subjectDomain: "transport",
      subjectId: "route-12",
      impactBand: "cohort",
      riskLevel: "low",
      evidence: [strong("entity-4")],
    });

    expect(await quiet.get(TENANT, recommendation.id)).toEqual(recommendation);
    expect(published).toEqual([]);
  });
});
