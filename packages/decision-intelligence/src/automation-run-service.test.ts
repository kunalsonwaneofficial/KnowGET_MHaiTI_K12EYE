import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AutomationRule,
  type CreateAutomationRuleParams,
  type DeclareActionParams,
  activateRule,
  createAutomationRule,
  declareAction,
  declareCondition,
} from "./automation-rule";
import { observedFact, runBlockingReasons } from "./automation-run";
import { AutomationRunService } from "./automation-run-service";
import type { ActionView } from "./decision-view";
import {
  AnonymousRunApprovalError,
  AutomationRuleNotFoundError,
  AutomationRunNotFoundError,
  CapabilityNotInvocableError,
  InvalidRunTransitionError,
  RecommendationNotFoundError,
  RuleNotActiveError,
  RunNotCompensatableError,
} from "./errors";
import {
  InMemoryAutomationRuleRepository,
  InMemoryAutomationRunRepository,
  InMemoryRecommendationRepository,
} from "./ports";
import {
  type CreateRecommendationParams,
  type Recommendation,
  acceptRecommendation,
  citeEvidence,
  createRecommendation,
} from "./recommendation";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;

const NOTIFY = "attendance.notify-guardian";
const RETRACT = "attendance.retract-notice";
const SIGNAL = "attendance.fifth-consecutive-absence";

const SUBJECT = { subjectDomain: "attendance", subjectId: "student-4471" };

/** The ordinary shape of something a rule is allowed to do on its own: low risk, with a declared way back. */
const invocation = (patch: Partial<DeclareActionParams> = {}): ActionView =>
  declareAction({
    kind: "invoke_capability",
    targetKey: NOTIFY,
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: RETRACT,
    ...patch,
  });

describe("AutomationRunService", () => {
  let repository: InMemoryAutomationRunRepository;
  let rules: InMemoryAutomationRuleRepository;
  let recommendations: InMemoryRecommendationRepository;
  let unreachable: Set<string>;
  let asked: string[];
  let published: DomainEvent[];
  let svc: AutomationRunService;

  beforeEach(() => {
    repository = new InMemoryAutomationRunRepository();
    rules = new InMemoryAutomationRuleRepository();
    recommendations = new InMemoryRecommendationRepository();
    unreachable = new Set<string>();
    asked = [];
    published = [];
    svc = new AutomationRunService({
      repository,
      rules,
      recommendations,
      capabilities: {
        async isInvocable(_tenantId: TenantId, capabilityKey: string): Promise<boolean> {
          asked.push(capabilityKey);
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

  const spec = (patch: Partial<CreateAutomationRuleParams> = {}): CreateAutomationRuleParams => ({
    tenantId: TENANT,
    organizationId: ORG,
    key: "notify-on-fifth-absence",
    name: "Notify the guardian on a fifth consecutive absence",
    signalKey: SIGNAL,
    action: invocation(),
    autonomyMode: "auto_execute",
    ...patch,
  });

  /** A rule that exists and does not yet fire. */
  const drafted = async (
    patch: Partial<CreateAutomationRuleParams> = {},
  ): Promise<AutomationRule> => {
    const rule = createAutomationRule(spec(patch));
    await rules.save(rule);
    return rule;
  };

  /** The same rule, armed by a named person. */
  const armed = async (
    patch: Partial<CreateAutomationRuleParams> = {},
  ): Promise<AutomationRule> => {
    const rule = activateRule(createAutomationRule(spec(patch)), {
      activatedByUserId: "user-6602",
    });
    await rules.save(rule);
    return rule;
  };

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

  // --- Firing ----------------------------------------------------------------------

  it("fires an armed rule and writes down the verdict the gate reached", async () => {
    const rule = await armed();

    const run = await svc.fire(TENANT, rule.id, SUBJECT);

    expect(run.disposition).toBe("auto_execute");
    expect(run.status).toBe("gated");
    expect(run.reasons).toEqual([]);
    expect(run.ruleKey).toBe(rule.key);
    expect(run.signalKey).toBe(SIGNAL);
    expect(await repository.findById(TENANT, run.id)).toEqual(run);
    expect(types()).toEqual(["decision.automation_run.fired"]);
  });

  /**
   * A firing keeps the facts the rule examined and nothing else — what a governance review needs is why *this*
   * rule fired, not everything that happened to be travelling with the signal.
   */
  it("keeps the facts the rule examined and discards the rest", async () => {
    const rule = await armed({
      conditions: [
        declareCondition({ key: "consecutive-absences", operator: "greater_than", values: ["4"] }),
      ],
    });

    const run = await svc.fire(TENANT, rule.id, {
      ...SUBJECT,
      facts: { "consecutive-absences": 5, "year-group": "9" },
    });

    expect(run.observedFacts.map((fact) => fact.key)).toEqual(["consecutive-absences"]);
    expect(observedFact(run, "consecutive-absences")).toBe("5");
    expect(observedFact(run, "year-group")).toBeNull();
  });

  it("refuses to fire a rule nobody has armed", async () => {
    const rule = await drafted();

    await expect(svc.fire(TENANT, rule.id, SUBJECT)).rejects.toThrow(RuleNotActiveError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("404s on a rule that is not there", async () => {
    await expect(svc.fire(TENANT, "nobody-1" as Uuid, SUBJECT)).rejects.toThrow(
      AutomationRuleNotFoundError,
    );
  });

  /** The contract's first rule at the door it exists for: the mode alone refers the act to a person. */
  it("refers a firing to a person when the rule was never allowed to act alone", async () => {
    const rule = await armed({ autonomyMode: "auto_with_approval" });

    const run = await svc.fire(TENANT, rule.id, SUBJECT);

    expect(run.status).toBe("awaiting_approval");
    expect(run.reasons).toContain("mode_forbids_auto_execution");
    expect(await svc.listAwaitingApproval(TENANT)).toHaveLength(1);
  });

  it("refers a firing to a person when the act carries more risk than autonomy allows", async () => {
    const rule = await armed({ action: invocation({ riskLevel: "high" }) });

    const run = await svc.fire(TENANT, rule.id, SUBJECT);

    expect(run.status).toBe("awaiting_approval");
    expect(run.reasons).toContain("risk_exceeds_auto_execution_ceiling");
  });

  // --- The gate's view of the recommendation ---------------------------------------

  /**
   * The caller names the recommendation and this service loads it. A firing cannot be talked past the gate by
   * describing an ungrounded or already-answered recommendation as open and sound.
   */
  it("builds the gate's view of the recommendation from what is stored", async () => {
    const rule = await armed();
    const recommendation = await ask();

    const run = await svc.fire(TENANT, rule.id, {
      ...SUBJECT,
      recommendationId: recommendation.id,
    });

    expect(run.recommendationId).toBe(recommendation.id);
    expect(run.status).toBe("gated");
  });

  it("refuses outright to act on a question that has already been answered", async () => {
    const rule = await armed();
    const recommendation = await ask();
    await recommendations.save(
      acceptRecommendation(recommendation, { resolvedByUserId: "user-6602" }),
    );

    const run = await svc.fire(TENANT, rule.id, {
      ...SUBJECT,
      recommendationId: recommendation.id,
    });

    expect(run.status).toBe("blocked");
    expect(runBlockingReasons(run)).toContain("recommendation_not_open");
    expect(run.settledAt).not.toBeNull();
    expect(await repository.findById(TENANT, run.id)).toEqual(run);
  });

  it("asks a person when the subject was declared to need one", async () => {
    const rule = await armed();
    const recommendation = await ask({ requiresHumanJudgement: true });

    const run = await svc.fire(TENANT, rule.id, {
      ...SUBJECT,
      recommendationId: recommendation.id,
    });

    expect(run.status).toBe("awaiting_approval");
    expect(run.reasons).toContain("subject_requires_human_judgement");
  });

  it("refuses to fire against a recommendation that is not there, writing nothing", async () => {
    const rule = await armed();

    await expect(
      svc.fire(TENANT, rule.id, { ...SUBJECT, recommendationId: "nobody-1" as Uuid }),
    ).rejects.toThrow(RecommendationNotFoundError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(published).toEqual([]);
  });

  // --- Dispatching a signal --------------------------------------------------------

  it("fires every armed rule the signal matches, once each", async () => {
    const early = await armed({
      key: "notify-on-fifth-absence",
      conditions: [
        declareCondition({ key: "consecutive-absences", operator: "greater_than", values: ["4"] }),
      ],
    });
    const senior = await armed({
      key: "escalate-senior-absence",
      name: "Escalate a senior absence",
      conditions: [declareCondition({ key: "year-group", operator: "in", values: ["11", "12"] })],
    });
    const elsewhere = await armed({
      key: "review-transport",
      signalKey: "transport.route-delayed",
    });

    const fired = await svc.fireOnSignal(TENANT, SIGNAL, {
      ...SUBJECT,
      facts: { "consecutive-absences": 5, "year-group": "9" },
    });

    expect(fired).toHaveLength(1);
    expect(fired[0]?.ruleId).toBe(early.id);
    expect(await svc.listByRule(TENANT, senior.id)).toEqual([]);
    expect(await svc.listByRule(TENANT, elsewhere.id)).toEqual([]);
  });

  it("fires nothing at all when the facts satisfy no rule", async () => {
    await armed({
      conditions: [
        declareCondition({ key: "consecutive-absences", operator: "greater_than", values: ["4"] }),
      ],
    });

    expect(await svc.fireOnSignal(TENANT, SIGNAL, { ...SUBJECT, facts: {} })).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(published).toEqual([]);
  });

  it("does not reach a rule that is only drafted", async () => {
    await drafted();

    expect(await svc.fireOnSignal(TENANT, SIGNAL, SUBJECT)).toEqual([]);
  });

  // --- Approval --------------------------------------------------------------------

  it("records who let a referred firing proceed, and carries it through", async () => {
    const rule = await armed({ autonomyMode: "auto_with_approval" });
    const referred = await svc.fire(TENANT, rule.id, SUBJECT);
    published = [];

    const approved = await svc.approve(TENANT, referred.id, {
      approvedByUserId: "user-9",
      note: "Guardian reachable on the mobile on file",
    });
    await svc.beginExecution(TENANT, referred.id, "invocation-771");
    const done = await svc.complete(TENANT, referred.id);

    expect(approved.approvedByUserId).toBe("user-9");
    expect(approved.status).toBe("gated");
    expect(done.status).toBe("succeeded");
    expect(types()).toEqual([
      "decision.automation_run.approved",
      "decision.automation_run.execution_started",
      "decision.automation_run.succeeded",
    ]);
  });

  it("refuses an approval with nobody behind it", async () => {
    const rule = await armed({ autonomyMode: "auto_with_approval" });
    const referred = await svc.fire(TENANT, rule.id, SUBJECT);

    await expect(svc.approve(TENANT, referred.id, { approvedByUserId: "   " })).rejects.toThrow(
      AnonymousRunApprovalError,
    );
  });

  it("records a refusal and settles the firing with it", async () => {
    const rule = await armed({ autonomyMode: "auto_with_approval" });
    const referred = await svc.fire(TENANT, rule.id, SUBJECT);

    const rejected = await svc.reject(TENANT, referred.id, {
      rejectedByUserId: "user-9",
      reason: "Guardian already contacted by phone",
    });

    expect(rejected.status).toBe("blocked");
    expect(rejected.rejectionReason).toBe("Guardian already contacted by phone");
    expect(rejected.settledAt).not.toBeNull();
    expect(await svc.listAwaitingApproval(TENANT)).toEqual([]);
    expect(types()).toContain("decision.automation_run.rejected");
  });

  it("refuses to approve a firing the gate never referred to anybody", async () => {
    const rule = await armed();
    const run = await svc.fire(TENANT, rule.id, SUBJECT);

    await expect(svc.approve(TENANT, run.id, { approvedByUserId: "user-9" })).rejects.toThrow(
      InvalidRunTransitionError,
    );
  });

  /** A refusal at the gate is not an approval queue item. No signature moves it. */
  it("refuses to approve a firing the gate refused outright", async () => {
    const rule = await armed();
    const recommendation = await ask();
    await recommendations.save(
      acceptRecommendation(recommendation, { resolvedByUserId: "user-6602" }),
    );
    const blocked = await svc.fire(TENANT, rule.id, {
      ...SUBJECT,
      recommendationId: recommendation.id,
    });

    await expect(svc.approve(TENANT, blocked.id, { approvedByUserId: "user-9" })).rejects.toThrow(
      InvalidRunTransitionError,
    );
  });

  // --- Execution and the way back --------------------------------------------------

  it("will not set anything in motion that the gate has not cleared", async () => {
    const rule = await armed({ autonomyMode: "auto_with_approval" });
    const referred = await svc.fire(TENANT, rule.id, SUBJECT);

    await expect(svc.beginExecution(TENANT, referred.id, "invocation-772")).rejects.toThrow(
      InvalidRunTransitionError,
    );
  });

  /** A failure report says the call did not succeed, not that nothing happened at the other end. */
  it("keeps the obligation to undo when the runtime could not carry it out", async () => {
    const rule = await armed();
    const run = await svc.fire(TENANT, rule.id, SUBJECT);
    await svc.beginExecution(TENANT, run.id, "invocation-773");

    const failed = await svc.fail(TENANT, run.id, "capability timed out");

    expect(failed.status).toBe("failed");
    expect(failed.executionError).toBe("capability timed out");
    expect(failed.compensationState).toBe("available");
    expect(await svc.listCompensationDue(TENANT)).toHaveLength(1);
  });

  /**
   * The contract's third rule at the moment it is exercised. A reversal recorded against a capability nobody can
   * call leaves the institution believing something was put back that was not, and it stops looking.
   */
  it("checks the compensating capability when the reversal is claimed, not before", async () => {
    const rule = await armed();
    const run = await svc.fire(TENANT, rule.id, SUBJECT);
    await svc.beginExecution(TENANT, run.id, "invocation-774");
    await svc.complete(TENANT, run.id);

    unreachable.add(RETRACT);
    await expect(svc.compensate(TENANT, run.id, "reversal-1")).rejects.toThrow(
      CapabilityNotInvocableError,
    );

    unreachable.delete(RETRACT);
    const compensated = await svc.compensate(TENANT, run.id, "reversal-1");

    expect(compensated.status).toBe("compensated");
    expect(compensated.compensationRef).toBe("reversal-1");
    expect(compensated.compensationState).toBe("compensated");
    expect(await svc.listCompensationDue(TENANT)).toEqual([]);
    expect(types()).toContain("decision.automation_run.compensated");
  });

  it("refuses a reversal for a firing that never did anything, without asking the catalog", async () => {
    const rule = await armed();
    const run = await svc.fire(TENANT, rule.id, SUBJECT);

    await expect(svc.compensate(TENANT, run.id, "reversal-2")).rejects.toThrow(
      RunNotCompensatableError,
    );
    expect(asked).toEqual([]);
  });

  it("owes nothing back for an act that needs nothing put back", async () => {
    const rule = await armed({
      action: invocation({ reversibility: "reversible", compensationKey: null }),
    });
    const run = await svc.fire(TENANT, rule.id, SUBJECT);
    await svc.beginExecution(TENANT, run.id, "invocation-775");
    const done = await svc.complete(TENANT, run.id, { executionRef: "invocation-775b" });

    expect(done.compensationState).toBe("not_required");
    expect(done.executionRef).toBe("invocation-775b");
    expect(await svc.listCompensationDue(TENANT)).toEqual([]);
    await expect(svc.compensate(TENANT, run.id, "reversal-3")).rejects.toThrow(
      RunNotCompensatableError,
    );
  });

  // --- Reading ---------------------------------------------------------------------

  it("keeps everything one rule has done and everything done about one subject", async () => {
    const rule = await armed();
    const other = await armed({ key: "escalate-senior-absence", name: "Escalate" });
    await svc.fire(TENANT, rule.id, SUBJECT);
    await svc.fire(TENANT, rule.id, { ...SUBJECT, subjectId: "student-9930" });
    await svc.fire(TENANT, other.id, SUBJECT);

    expect(await svc.listByRule(TENANT, rule.id)).toHaveLength(2);
    expect(await svc.listBySubject(TENANT, "attendance", "student-4471")).toHaveLength(2);
    expect(await svc.list(TENANT)).toHaveLength(3);
  });

  it("reads only inside the tenant asked about", async () => {
    const rule = await armed();
    const run = await svc.fire(TENANT, rule.id, SUBJECT);

    await expect(svc.get(OTHER, run.id)).rejects.toThrow(AutomationRunNotFoundError);
    expect(await svc.list(OTHER)).toEqual([]);
    expect(await svc.listByRule(OTHER, rule.id)).toEqual([]);
  });

  it("404s on a run that is not there", async () => {
    await expect(svc.get(TENANT, "nobody-1" as Uuid)).rejects.toThrow(AutomationRunNotFoundError);
  });

  it("works without an event bus at all", async () => {
    const quiet = new AutomationRunService({
      repository,
      rules,
      recommendations,
      capabilities: {
        async isInvocable(): Promise<boolean> {
          return true;
        },
      },
    });
    const rule = await armed();

    const run = await quiet.fire(TENANT, rule.id, SUBJECT);

    expect(await quiet.get(TENANT, run.id)).toEqual(run);
    expect(published).toEqual([]);
  });
});
