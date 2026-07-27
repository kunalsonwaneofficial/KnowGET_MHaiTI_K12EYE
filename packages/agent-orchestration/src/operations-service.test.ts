import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { OperationsService } from "./operations-service";
import { AgentService } from "./agent-service";
import { ApprovalService } from "./approval-service";
import { ExecutionPlanService } from "./execution-plan-service";
import { InvocationService } from "./invocation-service";
import { ToolService } from "./tool-service";
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

describe("OperationsService", () => {
  let agents: InMemoryAgentRepository;
  let capabilities: InMemoryToolRepository;
  let plans: InMemoryExecutionPlanRepository;
  let invocations: InMemoryToolInvocationRepository;
  let approvals: InMemoryApprovalRequestRepository;
  let svc: OperationsService;
  let agentSvc: AgentService;
  let catalog: ToolService;
  let planSvc: ExecutionPlanService;
  let invocationSvc: InvocationService;
  let approvalSvc: ApprovalService;
  let agentId: string;

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
    await catalog.activate(TENANT, tool.id);
    await agentSvc.grant(TENANT, agentId as Uuid, key);
  };

  const authorize = (capabilityKey: string, extra: Record<string, unknown> = {}) =>
    invocationSvc.authorize({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey,
      ...extra,
    });

  const land = async (capabilityKey: string, extra: Record<string, unknown> = {}) => {
    const invocation = await authorize(capabilityKey, extra);
    await invocationSvc.begin(TENANT, invocation.id);
    return invocationSvc.succeed(TENANT, invocation.id);
  };

  beforeEach(async () => {
    agents = new InMemoryAgentRepository();
    capabilities = new InMemoryToolRepository();
    plans = new InMemoryExecutionPlanRepository();
    invocations = new InMemoryToolInvocationRepository();
    approvals = new InMemoryApprovalRequestRepository();

    agentSvc = new AgentService({ repository: agents, capabilities, organizations: orgDir });
    catalog = new ToolService({ repository: capabilities, organizations: orgDir });
    planSvc = new ExecutionPlanService({
      repository: plans,
      agents,
      capabilities,
      approvals,
      organizations: orgDir,
    });
    invocationSvc = new InvocationService({
      repository: invocations,
      agents,
      capabilities,
      approvals,
      plans,
      organizations: orgDir,
    });
    approvalSvc = new ApprovalService({ repository: approvals });
    svc = new OperationsService({ agents, capabilities, plans, invocations, approvals });

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

  it("reports an empty tenant as empty, not as an error", async () => {
    const empty = new OperationsService({
      agents: new InMemoryAgentRepository(),
      capabilities: new InMemoryToolRepository(),
      plans: new InMemoryExecutionPlanRepository(),
      invocations: new InMemoryToolInvocationRepository(),
      approvals: new InMemoryApprovalRequestRepository(),
    });

    expect(await empty.summarize(TENANT)).toEqual({
      agentCount: 0,
      activeAgentCount: 0,
      capabilityCount: 0,
      planCount: 0,
      plansByStatus: [],
      invocationCount: 0,
      compensatedInvocationCount: 0,
      approvalCount: 0,
      pendingApprovalCount: 0,
      approvalRate: 0,
      humanGatedRate: 0,
    });
    expect(await empty.planPipeline(TENANT)).toEqual([]);
    expect(await empty.capabilityUsage(TENANT)).toEqual([]);
  });

  it("counts what is registered and how much of it is live", async () => {
    await catalogue("attendance.read");
    await catalogue("guardian.retract", { effect: "write" });
    await agentSvc.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "fees-assistant",
      name: "Fees assistant",
      autonomyLevel: "advisory",
    });

    const summary = await svc.summarize(TENANT);
    expect(summary.agentCount).toBe(2);
    expect(summary.activeAgentCount).toBe(1);
    expect(summary.capabilityCount).toBe(2);
  });

  it("rolls the plan pipeline up by status and by agent", async () => {
    await catalogue("attendance.read");
    const drafted = await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "Chase today's absences",
    });
    const withStep = await planSvc.addStep(TENANT, drafted.id, {
      capabilityKey: "attendance.read",
    });
    await planSvc.submit(TENANT, withStep.id);
    await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "A second plan nobody submitted",
    });

    expect(await svc.planPipeline(TENANT)).toEqual([
      { key: "approved", count: 1 },
      { key: "drafted", count: 1 },
    ]);
    expect(await svc.planLoadByAgent(TENANT)).toEqual([{ key: agentId, count: 2 }]);
    expect((await svc.summarize(TENANT)).planCount).toBe(2);
  });

  it("rolls invocations up by the capability they reached for", async () => {
    await catalogue("attendance.read");
    await catalogue("timetable.read");

    await land("attendance.read");
    await land("attendance.read", { ordinal: 2 });
    await land("timetable.read");

    expect(await svc.capabilityUsage(TENANT)).toEqual([
      { key: "attendance.read", count: 2 },
      { key: "timetable.read", count: 1 },
    ]);
  });

  /**
   * The two rates the gate is actually read by: how much of what ran needed a person, and how much of what a
   * person was asked they let through. The engine grades neither — a low approval rate is not a verdict.
   */
  it("measures how much needed a human, and how much a human allowed", async () => {
    await catalogue("attendance.read");
    await catalogue("guardian.notify", { effect: "write", riskLevel: "high" });

    const request = await invocationSvc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
    });
    await approvalSvc.approve(TENANT, request.id, { decidedByUserId: "user-3" });
    await land("guardian.notify");
    await land("attendance.read", { ordinal: 2 });

    const refused = await invocationSvc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
      stepId: "step-later",
    });
    await approvalSvc.reject(TENANT, refused.id, { decidedByUserId: "user-3" });
    const openRequest = await invocationSvc.requestApproval({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      capabilityKey: "guardian.notify",
      stepId: "step-later-still",
    });

    const summary = await svc.summarize(TENANT);
    expect(summary.invocationCount).toBe(2);
    expect(summary.humanGatedRate).toBe(50);
    expect(summary.approvalCount).toBe(3);
    expect(summary.pendingApprovalCount).toBe(1);
    expect(summary.approvalRate).toBe(50);
    expect(openRequest.decision).toBe("pending");
  });

  it("counts what had to be undone", async () => {
    await catalogue("guardian.retract", { effect: "write" });
    await catalogue("guardian.notify", {
      effect: "write",
      reversibility: "compensatable",
      compensationKey: "guardian.retract",
    });

    const landed = await land("guardian.notify");
    const undo = await land("guardian.retract", { ordinal: 2 });
    await invocationSvc.compensate(TENANT, landed.id, undo.id);

    const summary = await svc.summarize(TENANT);
    expect(summary.invocationCount).toBe(2);
    expect(summary.compensatedInvocationCount).toBe(1);
  });

  /**
   * Nothing here reads a goal, a reasoning statement or a person, so these figures stay safe to put on a
   * dashboard or hand to somebody not entitled to read the work underneath them.
   */
  it("carries no free text and nobody's name into a figure", async () => {
    await catalogue("attendance.read");
    await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "A goal that must not surface in a metric",
    });

    const serialized = JSON.stringify([
      await svc.summarize(TENANT),
      await svc.planPipeline(TENANT),
      await svc.planLoadByAgent(TENANT),
      await svc.capabilityUsage(TENANT),
    ]);
    expect(serialized).not.toContain("must not surface");
    expect(serialized).not.toContain("user-3");
  });

  it("reports on one tenant only", async () => {
    await catalogue("attendance.read");
    await land("attendance.read");

    const elsewhere = await svc.summarize(OTHER);
    expect(elsewhere.agentCount).toBe(0);
    expect(elsewhere.invocationCount).toBe(0);
    expect(await svc.capabilityUsage(OTHER)).toEqual([]);
    expect(await svc.planLoadByAgent(OTHER)).toEqual([]);
  });
});
