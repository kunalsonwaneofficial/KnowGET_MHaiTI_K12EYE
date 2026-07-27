import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { InvocationService, invocationSubjectId } from "./invocation-service";
import { AgentService } from "./agent-service";
import { ApprovalService } from "./approval-service";
import { ExecutionPlanService } from "./execution-plan-service";
import { ToolService } from "./tool-service";
import {
  ApprovalAlreadySpentError,
  ApprovalNotRequiredError,
  ApprovalRequestNotFoundError,
  ApprovalSubjectMismatchError,
  ExecutionPlanNotFoundError,
  InvocationNotAuthorizedError,
  PlanStepNotFoundError,
  ToolInvocationNotFoundError,
  UnknownCapabilityError,
} from "./errors";
import {
  InMemoryAgentRepository,
  InMemoryApprovalRequestRepository,
  InMemoryExecutionPlanRepository,
  InMemoryToolInvocationRepository,
  InMemoryToolRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;
const orgDir: OrganizationDirectory = {
  async exists(_tenantId, id) {
    return id === ORG;
  },
};

describe("InvocationService", () => {
  let repository: InMemoryToolInvocationRepository;
  let agents: InMemoryAgentRepository;
  let capabilities: InMemoryToolRepository;
  let approvals: InMemoryApprovalRequestRepository;
  let plans: InMemoryExecutionPlanRepository;
  let published: DomainEvent[];
  let svc: InvocationService;
  let agentSvc: AgentService;
  let catalog: ToolService;
  let planSvc: ExecutionPlanService;
  let approvalSvc: ApprovalService;
  let agentId: string;

  /** Register a capability and put it in service — the only state a grant or an invocation can resolve to. */
  const catalogue = async (key: string, overrides: Record<string, unknown> = {}) => {
    const tool = await catalog.register({
      tenantId: TENANT,
      organizationId: ORG,
      key,
      name: key,
      capabilityDomain: key.split(".")[0] ?? key,
      effect: "read",
      riskLevel: "low",
      reversibility: "reversible",
      ...overrides,
    });
    return catalog.activate(TENANT, tool.id);
  };

  /** Put a capability in the catalog and in this agent's reach, which is what authorization actually reads. */
  const reachable = async (key: string, overrides: Record<string, unknown> = {}) => {
    const tool = await catalogue(key, overrides);
    await agentSvc.grant(TENANT, agentId as Uuid, key);
    return tool;
  };

  const authorize = (capabilityKey: string, extra: Record<string, unknown> = {}) =>
    svc.authorize({ tenantId: TENANT, organizationId: ORG, agentId, capabilityKey, ...extra });

  /** Take one call all the way to landed, which is the only state a rollback has anything to say about. */
  const land = async (capabilityKey: string, extra: Record<string, unknown> = {}) => {
    const invocation = await authorize(capabilityKey, extra);
    await svc.begin(TENANT, invocation.id);
    return svc.succeed(TENANT, invocation.id);
  };

  beforeEach(async () => {
    repository = new InMemoryToolInvocationRepository();
    agents = new InMemoryAgentRepository();
    capabilities = new InMemoryToolRepository();
    approvals = new InMemoryApprovalRequestRepository();
    plans = new InMemoryExecutionPlanRepository();
    published = [];
    const events = {
      async publish(event: DomainEvent): Promise<void> {
        published.push(event);
      },
    };

    // Only the service under test is wired to the bus, so the recorded events are its own.
    agentSvc = new AgentService({ repository: agents, capabilities, organizations: orgDir });
    catalog = new ToolService({ repository: capabilities, organizations: orgDir });
    planSvc = new ExecutionPlanService({
      repository: plans,
      agents,
      capabilities,
      approvals,
      organizations: orgDir,
    });
    approvalSvc = new ApprovalService({ repository: approvals });
    svc = new InvocationService({
      repository,
      agents,
      capabilities,
      approvals,
      plans,
      organizations: orgDir,
      events,
    });

    const agent = await agentSvc.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-assistant",
      name: "Attendance assistant",
      autonomyLevel: "bounded",
    });
    agentId = agent.id;
    await agentSvc.activate(TENANT, agent.id);
  });

  it("says what would happen without recording that it was asked", async () => {
    await reachable("attendance.read");

    const decision = await svc.decide(TENANT, agentId, "attendance.read");
    expect(decision.outcome).toBe("allowed");
    expect(decision.reasons).toEqual([]);
    expect(await svc.list(TENANT)).toEqual([]);
    expect(published).toEqual([]);
  });

  it("resolves the capability by key, and knows nothing outside the catalog", async () => {
    await expect(svc.decide(TENANT, agentId, "fees.charge")).rejects.toThrow(
      UnknownCapabilityError,
    );
  });

  /**
   * A grant failure and a gate are different failures. No person can answer their way past a capability this
   * agent was never given, so putting that question in front of one would be a prompt over a foregone outcome.
   */
  it("refuses to raise a human gate over a denial no answer could open", async () => {
    await catalogue("fees.charge", { effect: "write", riskLevel: "high" });

    const decision = await svc.decide(TENANT, agentId, "fees.charge");
    expect(decision.outcome).toBe("denied");
    expect(decision.reasons).toContain("capability_not_granted");

    await expect(
      svc.requestApproval({
        tenantId: TENANT,
        organizationId: ORG,
        agentId,
        capabilityKey: "fees.charge",
      }),
    ).rejects.toThrow(ApprovalNotRequiredError);
  });

  it("refuses to raise a gate over a call that needs nobody", async () => {
    await reachable("attendance.read");

    await expect(
      svc.requestApproval({
        tenantId: TENANT,
        organizationId: ORG,
        agentId,
        capabilityKey: "attendance.read",
      }),
    ).rejects.toThrow(ApprovalNotRequiredError);
  });

  it("raises the gate once and returns the same question when asked again", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });

    const first = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });
    const second = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });

    expect(second.id).toBe(first.id);
    expect(first.reasons).toContain("risk_exceeds_autonomy");
    expect(first.riskLevel).toBe("high");
    expect(await approvalSvc.listPending(TENANT)).toHaveLength(1);
    expect(published.map((event) => event.type)).toEqual(["ai.approval.requested"]);
  });

  /** A call inside a plan is gated at the step; a call outside one at the agent-and-capability pair it names. */
  it("raises the gate against the step when the call belongs to a plan", async () => {
    expect(invocationSubjectId("agent-1", "guardian.notify")).toBe("agent-1:guardian.notify");
    expect(invocationSubjectId("agent-1", "guardian.notify", "step-2")).toBe("step-2");

    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });
    const request = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
      stepId: "step-2",
    });

    expect(request.subject).toBe("tool_invocation");
    expect(request.subjectId).toBe("step-2");
  });

  it("records an authorized call and announces it", async () => {
    await reachable("attendance.read");
    const invocation = await authorize("attendance.read");

    expect(invocation.status).toBe("authorized");
    expect(invocation.authorizationOutcome).toBe("allowed");
    expect(invocation.approvalRequestId).toBeNull();
    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(published.map((event) => event.type)).toEqual(["ai.invocation.authorized"]);
  });

  /**
   * The one event in this domain with no aggregate behind it. A refused call leaves no record — it did not
   * happen — so without the event the runtime's most security-relevant moments would also be its quietest.
   */
  it("announces a refusal, even though it records nothing", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });

    await expect(authorize("guardian.notify")).rejects.toThrow(InvocationNotAuthorizedError);
    expect(await svc.list(TENANT)).toEqual([]);

    const denial = published.at(-1);
    expect(denial?.type).toBe("ai.invocation.denied");
    const payload = denial?.payload as {
      authorizationOutcome: string;
      authorizationReasons: string[];
    };
    expect(payload.authorizationOutcome).toBe("denied");
    expect(payload.authorizationReasons).toContain("risk_exceeds_autonomy");
  });

  it("spends a granted approval and records which one opened the door", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });
    const request = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });
    await approvalSvc.approve(TENANT, request.id, { decidedByUserId: "user-3" });

    const invocation = await authorize("guardian.notify");
    expect(invocation.authorizationOutcome).toBe("requires_approval");
    expect(invocation.approvalRequestId).toBe(request.id);
    expect(invocation.authorizationReasons).toContain("risk_exceeds_autonomy");

    // "Spends" is literal: the grant is stamped with the invocation it was converted into, and announced as used.
    const after = await approvalSvc.get(TENANT, request.id);
    expect(after.consumedAt).not.toBeNull();
    expect(after.consumedByInvocationId).toBe(invocation.id);
    expect(published.map((event) => event.type)).toEqual([
      "ai.approval.requested",
      "ai.invocation.authorized",
      "ai.approval.spent",
    ]);
    expect(published.at(-1)?.payload).toMatchObject({
      approvalRequestId: request.id,
      consumedByInvocationId: invocation.id,
    });
  });

  /**
   * The gate is single-use, and this is the test that says so.
   *
   * Outside a plan an approval's subject is the agent-and-capability pair, not a step that can only run once — so
   * a grant that stayed spendable would let one human "yes" authorize that same call again, indefinitely. That is
   * not a gate; it is a door propped open. The second attempt must land exactly where an ungranted one does.
   */
  it("will not let one human yes authorize the same call twice", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });
    const request = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });
    await approvalSvc.approve(TENANT, request.id, { decidedByUserId: "user-3" });

    await authorize("guardian.notify");

    await expect(authorize("guardian.notify")).rejects.toThrow(InvocationNotAuthorizedError);
    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(published.at(-1)?.type).toBe("ai.invocation.denied");

    // And naming the spent grant explicitly does not get round it either.
    await expect(authorize("guardian.notify", { approvalRequestId: request.id })).rejects.toThrow(
      ApprovalAlreadySpentError,
    );
    expect(await svc.list(TENANT)).toHaveLength(1);
  });

  /** A fresh question, freshly answered, is what a second call takes — the gate is asked again, not reused. */
  it("lets the same call through again only on a second grant", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });
    const first = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });
    await approvalSvc.approve(TENANT, first.id, { decidedByUserId: "user-3" });
    await authorize("guardian.notify");

    // The spent grant no longer blocks a new question being raised for the same subject.
    const second = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });
    expect(second.id).not.toBe(first.id);
    await approvalSvc.approve(TENANT, second.id, { decidedByUserId: "user-4" });

    const invocation = await authorize("guardian.notify");
    expect(invocation.approvalRequestId).toBe(second.id);
    expect(await svc.list(TENANT)).toHaveLength(2);
  });

  /** A pending request is a question, not an answer, so it is deliberately not picked up as one. */
  it("does not treat an unanswered question as permission", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });
    await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });

    await expect(authorize("guardian.notify")).rejects.toThrow(InvocationNotAuthorizedError);
  });

  it("refuses an approval granted for something else — approvals are not transferable", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });
    await reachable("fees.charge", { effect: "write", riskLevel: "high" });

    const elsewhere = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "fees.charge",
    });
    await approvalSvc.approve(TENANT, elsewhere.id, { decidedByUserId: "user-3" });

    await expect(authorize("guardian.notify", { approvalRequestId: elsewhere.id })).rejects.toThrow(
      ApprovalSubjectMismatchError,
    );
    expect(published.at(-1)?.type).toBe("ai.invocation.denied");
  });

  it("refuses a named approval that does not exist", async () => {
    await reachable("guardian.notify", { effect: "write", riskLevel: "high" });

    await expect(
      authorize("guardian.notify", { approvalRequestId: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toThrow(ApprovalRequestNotFoundError);
  });

  /**
   * A dangling placement would sever the call from the plan it is accountable to, and a rollback derived from
   * that plan would miss it entirely.
   */
  it("refuses a call that claims a plan or a step it does not belong to", async () => {
    await reachable("attendance.read");

    await expect(
      authorize("attendance.read", { planId: "22222222-2222-4222-8222-222222222222" }),
    ).rejects.toThrow(ExecutionPlanNotFoundError);

    const plan = await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "Chase today's absences",
    });
    await expect(
      authorize("attendance.read", { planId: plan.id, stepId: "step-nope" }),
    ).rejects.toThrow(PlanStepNotFoundError);
  });

  it("accepts a call placed on a step the plan actually holds", async () => {
    await reachable("attendance.read");
    const drafted = await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "Chase today's absences",
    });
    const plan = await planSvc.addStep(TENANT, drafted.id, { capabilityKey: "attendance.read" });
    const stepId = plan.steps[0]?.id ?? "";

    const invocation = await authorize("attendance.read", { planId: plan.id, stepId });
    expect(invocation.planId).toBe(plan.id);
    expect(invocation.stepId).toBe(stepId);
  });

  it("walks a call from authorized to landed, announcing each move", async () => {
    await reachable("attendance.read");
    const invocation = await authorize("attendance.read");

    expect((await svc.begin(TENANT, invocation.id)).status).toBe("executing");
    const settled = await svc.succeed(TENANT, invocation.id);
    expect(settled.status).toBe("succeeded");
    expect(settled.settledAt).not.toBeNull();

    expect(published.map((event) => event.type)).toEqual([
      "ai.invocation.authorized",
      "ai.invocation.started",
      "ai.invocation.succeeded",
    ]);
  });

  it("records a failure as a stable code, never as a message", async () => {
    await reachable("attendance.read");
    const invocation = await authorize("attendance.read");
    await svc.begin(TENANT, invocation.id);

    const failed = await svc.fail(TENANT, invocation.id, "upstream_timeout");
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("upstream_timeout");
    expect(published.at(-1)?.type).toBe("ai.invocation.failed");
  });

  it("links an undone call to the call that undid it", async () => {
    await reachable("guardian.retract", { effect: "write" });
    await reachable("guardian.notify", {
      effect: "write",
      reversibility: "compensatable",
      compensationKey: "guardian.retract",
    });

    const landed = await land("guardian.notify");
    const undo = await land("guardian.retract", { ordinal: 2 });

    const compensated = await svc.compensate(TENANT, landed.id, undo.id);
    expect(compensated.status).toBe("compensated");
    expect(compensated.compensatedByInvocationId).toBe(undo.id);
    expect(published.at(-1)?.type).toBe("ai.invocation.compensated");
  });

  it("will not accept an undo that is not itself a recorded call", async () => {
    await reachable("guardian.retract", { effect: "write" });
    await reachable("guardian.notify", {
      effect: "write",
      reversibility: "compensatable",
      compensationKey: "guardian.retract",
    });
    const landed = await land("guardian.notify");

    await expect(
      svc.compensate(TENANT, landed.id, "33333333-3333-4333-8333-333333333333"),
    ).rejects.toThrow(ToolInvocationNotFoundError);
  });

  /** What a rollback would take is derived from what actually ran, in the reverse of the order it ran in. */
  it("derives undoing a plan from the calls that landed, last done first undone", async () => {
    await reachable("guardian.retract", { effect: "write" });
    await reachable("attendance.read");
    await reachable("guardian.notify", {
      effect: "write",
      reversibility: "compensatable",
      compensationKey: "guardian.retract",
    });
    const drafted = await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "Chase today's absences",
    });
    const planId = drafted.id;

    await land("attendance.read", { planId, ordinal: 1 });
    const notified = await land("guardian.notify", { planId, ordinal: 2 });
    // Authorized but never run: it changed nothing, so there is nothing to undo.
    await authorize("guardian.notify", { planId, ordinal: 3 });

    const rollback = await svc.rollbackPlanFor(TENANT, planId);
    expect(rollback.steps).toEqual([
      {
        invocationId: notified.id,
        capabilityKey: "guardian.notify",
        compensationKey: "guardian.retract",
        ordinal: 1,
      },
    ]);
    expect(rollback.fullyReversible).toBe(true);
    expect(await svc.listByPlan(TENANT, planId)).toHaveLength(3);
  });

  it("says plainly that a landed irreversible call cannot be undone", async () => {
    await reachable("enrolment.withdraw", { effect: "write", reversibility: "irreversible" });
    const request = await svc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "enrolment.withdraw",
    });
    await approvalSvc.approve(TENANT, request.id, { decidedByUserId: "user-3" });

    const drafted = await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "Close the roll",
    });
    const landed = await land("enrolment.withdraw", { planId: drafted.id });

    const rollback = await svc.rollbackPlanFor(TENANT, drafted.id);
    expect(rollback.steps).toEqual([]);
    expect(rollback.irreversibleInvocationIds).toEqual([landed.id]);
    expect(rollback.fullyReversible).toBe(false);
  });

  it("keeps each agent's calls answerable on their own", async () => {
    await reachable("attendance.read");
    await authorize("attendance.read");

    expect(await svc.listByAgent(TENANT, agentId)).toHaveLength(1);
    expect(await svc.listByAgent(TENANT, "44444444-4444-4444-8444-444444444444")).toEqual([]);
  });

  it("does not answer for another tenant's call, on read or on write", async () => {
    await reachable("attendance.read");
    const invocation = await authorize("attendance.read");

    await expect(svc.get(OTHER, invocation.id)).rejects.toThrow(ToolInvocationNotFoundError);
    await expect(svc.begin(OTHER, invocation.id)).rejects.toThrow(ToolInvocationNotFoundError);
    expect(await svc.list(OTHER)).toEqual([]);
  });
});
