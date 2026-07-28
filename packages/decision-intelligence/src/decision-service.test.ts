import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { declareAction } from "./automation-rule";
import { DecisionService } from "./decision-service";
import type { ActionView } from "./decision-view";
import {
  CapabilityNotInvocableError,
  DecisionRecordNotFoundError,
  RecommendationNotFoundError,
  RecommendationNotOpenError,
} from "./errors";
import { InMemoryDecisionRecordRepository, InMemoryRecommendationRepository } from "./ports";
import {
  type CreateRecommendationParams,
  type Recommendation,
  citeEvidence,
  createRecommendation,
} from "./recommendation";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;

const NOTIFY = "attendance.notify-guardian";
const RETRACT = "attendance.retract-notice";

/** A reversible-by-compensation invocation — the ordinary shape of something a decision authorizes. */
const invocation = (patch: Partial<Parameters<typeof declareAction>[0]> = {}): ActionView =>
  declareAction({
    kind: "invoke_capability",
    targetKey: NOTIFY,
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: RETRACT,
    ...patch,
  });

describe("DecisionService", () => {
  let repository: InMemoryDecisionRecordRepository;
  let recommendations: InMemoryRecommendationRepository;
  let unreachable: Set<string>;
  let published: DomainEvent[];
  let svc: DecisionService;

  beforeEach(() => {
    repository = new InMemoryDecisionRecordRepository();
    recommendations = new InMemoryRecommendationRepository();
    unreachable = new Set<string>();
    published = [];
    svc = new DecisionService({
      repository,
      recommendations,
      capabilities: {
        async isInvocable(_tenantId: TenantId, capabilityKey: string): Promise<boolean> {
          return !unreachable.has(capabilityKey);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const ask = async (patch: Partial<CreateRecommendationParams> = {}): Promise<Recommendation> => {
    const recommendation = createRecommendation({
      tenantId: TENANT,
      organizationId: ORG,
      title: "Notify the guardian of a fifth consecutive absence",
      subjectDomain: "attendance",
      subjectId: "student-4471",
      impactBand: "individual",
      riskLevel: "low",
      evidence: [
        citeEvidence({ source: "knowledge_graph", ref: "entity-8812", strength: "strong" }),
      ],
      ...patch,
    });
    await recommendations.save(recommendation);
    return recommendation;
  };

  const types = (): readonly string[] => published.map((event) => event.type);

  // --- Deciding --------------------------------------------------------------------

  /**
   * The join no aggregate can make on its own: the decision record knows the recommendation's id but not its
   * store, and the recommendation refuses an anonymous resolution outright.
   */
  it("records what a person decided and closes the question they answered", async () => {
    const recommendation = await ask();

    const decision = await svc.decide(TENANT, recommendation.id, {
      disposition: "approved",
      decidedByUserId: "user-6602",
      note: "Guardian reachable on the mobile on file",
    });

    expect(decision.recommendationId).toBe(recommendation.id);
    expect(decision.decidedByUserId).toBe("user-6602");
    expect(decision.evidenceIds).toEqual([recommendation.evidence[0]?.id]);
    expect((await recommendations.findById(TENANT, recommendation.id))?.status).toBe("accepted");
    expect(types()).toEqual(["decision.record.recorded", "decision.recommendation.accepted"]);
  });

  it("records a refusal and closes the question with it", async () => {
    const recommendation = await ask();

    await svc.decide(TENANT, recommendation.id, {
      disposition: "rejected",
      decidedByUserId: "user-6602",
    });

    expect((await recommendations.findById(TENANT, recommendation.id))?.status).toBe("rejected");
    expect(types()).toEqual(["decision.record.recorded", "decision.recommendation.rejected"]);
  });

  /** A deferral is a decision and no kind of answer, so the question stays open and the trail records it. */
  it("records a deferral and leaves the question standing", async () => {
    const recommendation = await ask();

    const deferred = await svc.decide(TENANT, recommendation.id, {
      disposition: "deferred",
      decidedByUserId: "user-6602",
      note: "Waiting on the class teacher",
    });

    expect(deferred.disposition).toBe("deferred");
    expect((await recommendations.findById(TENANT, recommendation.id))?.status).toBe("proposed");
    expect(types()).toEqual(["decision.record.recorded"]);
  });

  /**
   * The machine acting is not the institution agreeing. An autonomous decision has nobody behind it by
   * construction, so there is nobody in whose name the recommendation could be resolved.
   */
  it("records an autonomous decision without anyone behind it, and does not close the question", async () => {
    const recommendation = await ask();

    const decision = await svc.decide(TENANT, recommendation.id, {
      disposition: "auto_executed",
      action: invocation(),
    });

    expect(decision.decidedByUserId).toBeNull();
    expect((await recommendations.findById(TENANT, recommendation.id))?.status).toBe("proposed");
    expect(types()).toEqual(["decision.record.recorded"]);
  });

  it("refuses every disposition on a question that has already been settled", async () => {
    const recommendation = await ask();
    await svc.decide(TENANT, recommendation.id, {
      disposition: "approved",
      decidedByUserId: "user-6602",
    });

    await expect(
      svc.decide(TENANT, recommendation.id, {
        disposition: "deferred",
        decidedByUserId: "user-9",
      }),
    ).rejects.toThrow(RecommendationNotOpenError);
  });

  it("refuses to decide about a recommendation that is not there", async () => {
    await expect(
      svc.decide(TENANT, "nobody-1" as Uuid, {
        disposition: "approved",
        decidedByUserId: "user-6602",
      }),
    ).rejects.toThrow(RecommendationNotFoundError);
  });

  it("reads only inside the tenant asked about", async () => {
    const recommendation = await ask();

    await expect(
      svc.decide(OTHER, recommendation.id, {
        disposition: "approved",
        decidedByUserId: "user-6602",
      }),
    ).rejects.toThrow(RecommendationNotFoundError);
  });

  // --- The way back, checked where it is claimed -----------------------------------

  it("refuses to authorize an action nobody can carry out, writing nothing", async () => {
    const recommendation = await ask();
    unreachable.add(NOTIFY);

    await expect(
      svc.decide(TENANT, recommendation.id, {
        disposition: "approved",
        decidedByUserId: "user-6602",
        action: invocation(),
      }),
    ).rejects.toThrow(CapabilityNotInvocableError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect((await recommendations.findById(TENANT, recommendation.id))?.status).toBe("proposed");
    expect(published).toEqual([]);
  });

  /**
   * A declared way back that names a capability which no longer exists is not a way back, and the difference
   * only shows up when somebody needs it.
   */
  it("refuses an action whose declared way back names nothing reachable", async () => {
    const recommendation = await ask();
    unreachable.add(RETRACT);

    await expect(
      svc.decide(TENANT, recommendation.id, {
        disposition: "approved",
        decidedByUserId: "user-6602",
        action: invocation(),
      }),
    ).rejects.toThrow(CapabilityNotInvocableError);
  });

  it("does not check a workflow key against the capability catalog", async () => {
    const recommendation = await ask();
    unreachable.add("guardian-escalation");

    const decision = await svc.decide(TENANT, recommendation.id, {
      disposition: "approved",
      decidedByUserId: "user-6602",
      action: invocation({
        kind: "start_workflow",
        targetKey: "guardian-escalation",
        compensationKey: null,
        reversibility: "reversible",
      }),
    });

    expect(decision.action?.targetKey).toBe("guardian-escalation");
  });

  // --- Execution -------------------------------------------------------------------

  const authorize = async (): Promise<Uuid> => {
    const recommendation = await ask();
    const decision = await svc.decide(TENANT, recommendation.id, {
      disposition: "approved",
      decidedByUserId: "user-6602",
      action: invocation(),
    });
    published = [];
    return decision.id;
  };

  it("carries a decision through to a completed execution", async () => {
    const id = await authorize();

    const requested = await svc.requestExecution(TENANT, id, "invocation-771");
    const completed = await svc.completeExecution(TENANT, id);

    expect(requested.executionRef).toBe("invocation-771");
    expect(completed.executionOutcome).toBe("succeeded");
    expect(types()).toEqual([
      "decision.record.execution_requested",
      "decision.record.execution_completed",
    ]);
  });

  /** A failure report says the call did not succeed, not that nothing changed. */
  it("keeps the obligation to undo when the runtime could not carry it out", async () => {
    const id = await authorize();
    await svc.requestExecution(TENANT, id, "invocation-772");

    const failed = await svc.failExecution(TENANT, id, "capability timed out");

    expect(failed.executionError).toBe("capability timed out");
    expect(failed.compensationState).toBe("available");
    expect(await svc.listCompensationDue(TENANT)).toHaveLength(1);
  });

  it("re-checks the action before setting anything in motion", async () => {
    const id = await authorize();
    unreachable.add(NOTIFY);

    await expect(svc.requestExecution(TENANT, id, "invocation-773")).rejects.toThrow(
      CapabilityNotInvocableError,
    );
    expect((await svc.get(TENANT, id)).executionOutcome).toBe("not_started");
  });

  /**
   * The third rule at the moment it is exercised. Recording a reversal against a capability that cannot be
   * reached leaves the institution believing something was undone that was not — so it is checked here, not
   * when the action was first declared.
   */
  it("checks the compensating capability when the reversal is claimed, not before", async () => {
    const id = await authorize();
    await svc.requestExecution(TENANT, id, "invocation-774");
    await svc.completeExecution(TENANT, id);

    unreachable.add(RETRACT);
    await expect(svc.compensate(TENANT, id, "reversal-1")).rejects.toThrow(
      CapabilityNotInvocableError,
    );

    unreachable.delete(RETRACT);
    const compensated = await svc.compensate(TENANT, id, "reversal-1");

    expect(compensated.compensationState).toBe("compensated");
    expect(compensated.compensationRef).toBe("reversal-1");
    expect(await svc.listCompensationDue(TENANT)).toEqual([]);
    expect(types()).toContain("decision.record.compensated");
  });

  // --- Reading ---------------------------------------------------------------------

  it("keeps the whole trail of decisions about one question, oldest first", async () => {
    const recommendation = await ask();
    await svc.decide(TENANT, recommendation.id, {
      disposition: "deferred",
      decidedByUserId: "user-1",
      note: "first",
    });
    await svc.decide(TENANT, recommendation.id, {
      disposition: "deferred",
      decidedByUserId: "user-2",
      note: "second",
    });
    await svc.decide(TENANT, recommendation.id, {
      disposition: "approved",
      decidedByUserId: "user-3",
    });

    const trail = await svc.listByRecommendation(TENANT, recommendation.id);

    expect(trail.map((decision) => decision.disposition)).toEqual([
      "deferred",
      "deferred",
      "approved",
    ]);
    expect(await svc.list(TENANT)).toHaveLength(3);
    expect(await svc.list(OTHER)).toEqual([]);
  });

  it("404s on a decision that is not there", async () => {
    await expect(svc.get(TENANT, "nobody-1" as Uuid)).rejects.toThrow(DecisionRecordNotFoundError);
  });

  it("works without an event bus at all", async () => {
    const quiet = new DecisionService({
      repository,
      recommendations,
      capabilities: {
        async isInvocable(): Promise<boolean> {
          return true;
        },
      },
    });
    const recommendation = await ask();

    const decision = await quiet.decide(TENANT, recommendation.id, {
      disposition: "approved",
      decidedByUserId: "user-6602",
    });

    expect(await quiet.get(TENANT, decision.id)).toEqual(decision);
    expect(published).toEqual([]);
  });
});
