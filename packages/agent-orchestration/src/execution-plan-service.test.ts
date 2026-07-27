import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AgentService } from "./agent-service";
import { ExecutionPlanService } from "./execution-plan-service";
import { ToolService } from "./tool-service";
import {
  AgentNotFoundError,
  ApprovalRequestNotFoundError,
  ExecutionPlanNotFoundError,
  InvalidPlanTransitionError,
  OrganizationNotFoundForAgentError,
  PlanNotSettledError,
  StepDependencyNotMetError,
  UnknownCapabilityError,
  UnknownStepDependencyError,
  UnsoundPlanError,
} from "./errors";
import {
  InMemoryAgentRepository,
  InMemoryApprovalRequestRepository,
  InMemoryExecutionPlanRepository,
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

describe("ExecutionPlanService", () => {
  let plans: InMemoryExecutionPlanRepository;
  let agents: InMemoryAgentRepository;
  let capabilities: InMemoryToolRepository;
  let approvals: InMemoryApprovalRequestRepository;
  let published: DomainEvent[];
  let svc: ExecutionPlanService;
  let catalog: ToolService;
  let agentId: Uuid;

  const catalogue = async (key: string, overrides: Record<string, unknown> = {}): Promise<void> => {
    const tool = await catalog.register({
      tenantId: TENANT,
      organizationId: ORG,
      key,
      name: key,
      capabilityDomain: "attendance",
      effect: "read",
      riskLevel: "low",
      reversibility: "reversible",
      ...overrides,
    });
    await catalog.activate(TENANT, tool.id);
  };

  beforeEach(async () => {
    plans = new InMemoryExecutionPlanRepository();
    agents = new InMemoryAgentRepository();
    capabilities = new InMemoryToolRepository();
    approvals = new InMemoryApprovalRequestRepository();
    published = [];
    const events = {
      async publish(event: DomainEvent): Promise<void> {
        published.push(event);
      },
    };
    svc = new ExecutionPlanService({
      repository: plans,
      agents,
      capabilities,
      approvals,
      organizations: orgDir,
      events,
    });
    catalog = new ToolService({ repository: capabilities, organizations: orgDir });

    const agentSvc = new AgentService({
      repository: agents,
      capabilities,
      organizations: orgDir,
    });
    const agent = await agentSvc.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-assistant",
      name: "Attendance assistant",
      autonomyLevel: "bounded",
    });
    agentId = agent.id;
    await agentSvc.activate(TENANT, agentId);
    await catalogue("attendance.read");
  });

  const draft = (reasoningSessionId?: string) =>
    svc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "Reconcile yesterday's attendance",
      ...(reasoningSessionId === undefined ? {} : { reasoningSessionId }),
    });

  it("drafts an empty plan for an agent that exists", async () => {
    const plan = await draft();

    expect(plan.status).toBe("drafted");
    expect(plan.steps).toEqual([]);
    expect(published.map((event) => event.type)).toEqual(["ai.execution_plan.drafted"]);
  });

  it("refuses a plan for an agent nobody registered, or an organization that does not exist", async () => {
    await expect(
      svc.draft({
        tenantId: TENANT,
        organizationId: ORG,
        agentId: "00000000-0000-4000-8000-000000000000",
        goal: "Do something",
      }),
    ).rejects.toThrow(AgentNotFoundError);

    await expect(
      svc.draft({
        tenantId: TENANT,
        organizationId: "org-9" as Uuid,
        agentId,
        goal: "Do something",
      }),
    ).rejects.toThrow(OrganizationNotFoundForAgentError);
  });

  /**
   * Catching an unknown key at authoring time rather than at submission is the difference between an error the
   * author sees and an error the approver inherits.
   */
  it("refuses a step naming a capability the catalog does not hold", async () => {
    const plan = await draft();

    await expect(svc.addStep(TENANT, plan.id, { capabilityKey: "fees.charge" })).rejects.toThrow(
      UnknownCapabilityError,
    );
    expect((await svc.get(TENANT, plan.id)).steps).toEqual([]);
  });

  it("adds and removes steps while the plan is still a draft", async () => {
    const plan = await draft();
    const withStep = await svc.addStep(TENANT, plan.id, {
      capabilityKey: "  Attendance.Read ",
      intent: "Read 7B's register",
    });

    expect(withStep.steps).toHaveLength(1);
    expect(withStep.steps[0]?.capabilityKey).toBe("attendance.read");

    const stepId = withStep.steps[0]?.id ?? "";
    expect((await svc.removeStep(TENANT, plan.id, stepId)).steps).toEqual([]);
  });

  it("inspects a plan against the live catalog without moving it", async () => {
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });

    const inspection = await svc.inspect(TENANT, plan.id);
    expect(inspection).toMatchObject({ stepCount: 1, sound: true, requiresApproval: false });
    expect((await svc.get(TENANT, plan.id)).status).toBe("drafted");
  });

  it("submits a harmless plan straight to approved, with nobody asked", async () => {
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });

    const { plan: submitted, approvalRequest } = await svc.submit(TENANT, plan.id);
    expect(submitted.status).toBe("approved");
    expect(approvalRequest).toBeNull();
    expect(await approvals.listPending(TENANT)).toEqual([]);
  });

  /**
   * A plan that could reach `awaiting_approval` without a request having been raised would be a plan waiting on
   * a gate nobody was asked to open: it would look governed and would simply stop, with nobody accountable.
   */
  it("raises the human request in the same act that puts a plan behind the gate", async () => {
    await catalogue("guardian.notify", {
      effect: "write",
      riskLevel: "high",
      reversibility: "irreversible",
    });
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    await svc.addStep(TENANT, plan.id, { capabilityKey: "guardian.notify" });

    const { plan: submitted, approvalRequest } = await svc.submit(TENANT, plan.id);

    expect(submitted.status).toBe("awaiting_approval");
    expect(approvalRequest).not.toBeNull();
    expect(approvalRequest?.subject).toBe("execution_plan");
    expect(approvalRequest?.subjectId).toBe(submitted.id);
    expect(await approvals.listPending(TENANT)).toHaveLength(1);
    expect(published.map((event) => event.type)).toContain("ai.approval.requested");
  });

  /** A plan is exactly as dangerous as its most dangerous step, so that is what a person is asked to accept. */
  it("raises the request at the highest risk the plan reaches, not the risk of any one step", async () => {
    await catalogue("fees.charge", {
      effect: "write",
      riskLevel: "critical",
      reversibility: "irreversible",
    });
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    await svc.addStep(TENANT, plan.id, { capabilityKey: "fees.charge" });

    const { approvalRequest } = await svc.submit(TENANT, plan.id);
    expect(approvalRequest?.riskLevel).toBe("critical");
  });

  it("refuses a step that waits on a step this plan does not have", async () => {
    const plan = await draft();

    await expect(
      svc.addStep(TENANT, plan.id, {
        capabilityKey: "attendance.read",
        dependsOn: ["step-that-is-not-here"],
      }),
    ).rejects.toThrow(UnknownStepDependencyError);
  });

  /**
   * Authoring-time checks make a plan sound when it is written; the catalog can still move underneath it
   * afterwards. Re-inspecting at submission is what catches that, and it catches it before anybody is asked.
   */
  it("refuses to submit a plan whose capability has since left the catalog", async () => {
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    const tool = await catalog.getByKey(TENANT, "attendance.read");
    await catalog.remove(TENANT, tool.id);

    await expect(svc.submit(TENANT, plan.id)).rejects.toThrow(UnsoundPlanError);
    expect((await svc.get(TENANT, plan.id)).status).toBe("drafted");
  });

  it("refuses to submit a plan naming a capability that has since been deprecated", async () => {
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    const tool = await catalog.getByKey(TENANT, "attendance.read");
    await catalog.deprecate(TENANT, tool.id);

    await expect(svc.submit(TENANT, plan.id)).rejects.toThrow(UnsoundPlanError);
  });

  const gated = async (): Promise<Uuid> => {
    await catalogue("guardian.notify", {
      effect: "write",
      riskLevel: "high",
      reversibility: "irreversible",
    });
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "guardian.notify" });
    await svc.submit(TENANT, plan.id);
    return plan.id;
  };

  it("decides the request and moves the plan together, so the two can never disagree", async () => {
    const id = await gated();
    const { plan, approvalRequest } = await svc.approve(TENANT, id, {
      decidedByUserId: "user-3",
      note: "Spoke to the form tutor",
    });

    expect(plan.status).toBe("approved");
    expect(plan.approvalRequestId).toBe(approvalRequest?.id);
    expect(approvalRequest?.decision).toBe("approved");
    expect(await approvals.listPending(TENANT)).toEqual([]);
    expect(published.at(-1)?.type).toBe("ai.execution_plan.approved");
  });

  it("records a refusal the same way, and the plan is terminal from there", async () => {
    const id = await gated();
    const { plan } = await svc.reject(TENANT, id, { decidedByUserId: "user-3" });

    expect(plan.status).toBe("rejected");
    await expect(svc.start(TENANT, id)).rejects.toThrow(InvalidPlanTransitionError);
  });

  it("refuses to decide a plan no one was asked about", async () => {
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    await svc.submit(TENANT, plan.id);

    await expect(svc.approve(TENANT, plan.id, { decidedByUserId: "user-3" })).rejects.toThrow(
      ApprovalRequestNotFoundError,
    );
  });

  it("refuses a second decision on a gate that has already been answered", async () => {
    const id = await gated();
    await svc.approve(TENANT, id, { decidedByUserId: "user-3" });

    await expect(svc.reject(TENANT, id, { decidedByUserId: "user-4" })).rejects.toThrow(
      ApprovalRequestNotFoundError,
    );
  });

  it("walks execution step by step to completion, and announces each plan-level move", async () => {
    const plan = await draft();
    const withStep = await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    const stepId = withStep.steps[0]?.id ?? "";
    await svc.submit(TENANT, plan.id);

    expect((await svc.start(TENANT, plan.id)).status).toBe("executing");
    await svc.beginStep(TENANT, plan.id, stepId);
    const ran = await svc.succeedStep(TENANT, plan.id, stepId, "invocation-1");
    expect(ran.steps[0]).toMatchObject({ status: "succeeded", invocationId: "invocation-1" });

    expect((await svc.complete(TENANT, plan.id)).status).toBe("completed");
    expect(published.map((event) => event.type)).toEqual([
      "ai.execution_plan.drafted",
      "ai.execution_plan.submitted",
      "ai.execution_plan.execution_started",
      "ai.execution_plan.completed",
    ]);
  });

  it("refuses to complete a plan with a step still outstanding", async () => {
    const plan = await draft();
    await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    await svc.submit(TENANT, plan.id);
    await svc.start(TENANT, plan.id);

    await expect(svc.complete(TENANT, plan.id)).rejects.toThrow(PlanNotSettledError);
  });

  /** A runner walks the graph, not the list: a step whose prerequisite has not succeeded is not pickable. */
  it("offers only the steps whose prerequisites have succeeded", async () => {
    const plan = await draft();
    const first = await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    const firstId = first.steps[0]?.id ?? "";
    const second = await svc.addStep(TENANT, plan.id, {
      capabilityKey: "attendance.read",
      dependsOn: [firstId],
    });
    const secondId = second.steps[1]?.id ?? "";
    await svc.submit(TENANT, plan.id);
    await svc.start(TENANT, plan.id);

    expect((await svc.nextSteps(TENANT, plan.id)).map((step) => step.id)).toEqual([firstId]);
    await expect(svc.beginStep(TENANT, plan.id, secondId)).rejects.toThrow(
      StepDependencyNotMetError,
    );

    await svc.beginStep(TENANT, plan.id, firstId);
    await svc.succeedStep(TENANT, plan.id, firstId, "invocation-1");
    expect((await svc.nextSteps(TENANT, plan.id)).map((step) => step.id)).toEqual([secondId]);
    expect(await svc.progress(TENANT, plan.id)).toMatchObject({
      total: 2,
      succeeded: 1,
      outstanding: 1,
      complete: false,
    });
  });

  it("records a failed step, skips what waited on it, then rolls the plan back", async () => {
    const plan = await draft();
    const first = await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    const firstId = first.steps[0]?.id ?? "";
    const second = await svc.addStep(TENANT, plan.id, {
      capabilityKey: "attendance.read",
      dependsOn: [firstId],
    });
    const secondId = second.steps[1]?.id ?? "";
    await svc.submit(TENANT, plan.id);
    await svc.start(TENANT, plan.id);
    await svc.beginStep(TENANT, plan.id, firstId);
    await svc.failStep(TENANT, plan.id, firstId, "invocation-1");
    await svc.skipStep(TENANT, plan.id, secondId);

    expect((await svc.fail(TENANT, plan.id)).status).toBe("failed");
    expect((await svc.rollBack(TENANT, plan.id)).status).toBe("rolled_back");
    expect(published.at(-1)?.type).toBe("ai.execution_plan.rolled_back");
  });

  it("records that a succeeded step has been undone", async () => {
    const plan = await draft();
    const withStep = await svc.addStep(TENANT, plan.id, { capabilityKey: "attendance.read" });
    const stepId = withStep.steps[0]?.id ?? "";
    await svc.submit(TENANT, plan.id);
    await svc.start(TENANT, plan.id);
    await svc.beginStep(TENANT, plan.id, stepId);
    await svc.succeedStep(TENANT, plan.id, stepId, "invocation-1");

    const undone = await svc.compensateStep(TENANT, plan.id, stepId);
    expect(undone.steps[0]?.status).toBe("compensated");
  });

  it("cancels a plan that never ran", async () => {
    const plan = await draft();
    expect((await svc.cancel(TENANT, plan.id)).status).toBe("cancelled");
  });

  it("answers what this reasoning produced, and what this agent proposed", async () => {
    const fromSession = await draft("session-9");
    await draft();

    expect(await svc.listBySession(TENANT, "session-9")).toEqual([fromSession]);
    expect(await svc.listByAgent(TENANT, agentId)).toHaveLength(2);
    expect(await svc.list(TENANT)).toHaveLength(2);
  });

  it("hands back the authorization engine's picture of a plan's agent", async () => {
    const plan = await draft();
    const view = await svc.agentViewFor(plan);

    expect(view).toMatchObject({ id: agentId, status: "active", autonomyLevel: "bounded" });
  });

  it("does not answer for another tenant's plan, on read or on write", async () => {
    const plan = await draft();

    await expect(svc.get(OTHER, plan.id)).rejects.toThrow(ExecutionPlanNotFoundError);
    await expect(svc.submit(OTHER, plan.id)).rejects.toThrow(ExecutionPlanNotFoundError);
    await expect(svc.remove(OTHER, plan.id)).rejects.toThrow(ExecutionPlanNotFoundError);
    expect(await svc.list(OTHER)).toEqual([]);
  });

  it("discards a plan that never ran", async () => {
    const plan = await draft();
    await svc.remove(TENANT, plan.id);

    expect(await svc.list(TENANT)).toEqual([]);
  });
});
