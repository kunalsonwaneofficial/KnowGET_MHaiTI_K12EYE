import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { createAgentDefinition } from "./agent";
import { approveRequest, createApprovalRequest } from "./approval-request";
import { addPlanStep, createExecutionPlan } from "./execution-plan";
import { createReasoningSession } from "./reasoning-session";
import { activateTool, createToolDefinition, toToolView } from "./tool";
import { authorizeToolInvocation } from "./tool-invocation";
import {
  InMemoryAgentRepository,
  InMemoryApprovalRequestRepository,
  InMemoryExecutionPlanRepository,
  InMemoryReasoningSessionRepository,
  InMemoryToolInvocationRepository,
  InMemoryToolRepository,
} from "./ports";

const T1 = "tenant-1" as TenantId;
const T2 = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;

const agentIn = (tenantId: TenantId, key = "scheduler") =>
  createAgentDefinition({
    tenantId,
    organizationId: ORG,
    key,
    name: "Scheduling assistant",
    autonomyLevel: "bounded",
  });

const toolIn = (tenantId: TenantId, key = "attendance.read") =>
  createToolDefinition({
    tenantId,
    organizationId: ORG,
    key,
    name: "Read attendance",
    capabilityDomain: "attendance",
    effect: "read",
    riskLevel: "low",
    reversibility: "reversible",
  });

const planIn = (tenantId: TenantId, agentId = "agent-1", reasoningSessionId?: string) =>
  createExecutionPlan({
    tenantId,
    organizationId: ORG,
    agentId,
    goal: "Reconcile yesterday's attendance",
    ...(reasoningSessionId === undefined ? {} : { reasoningSessionId }),
  });

const approvalIn = (tenantId: TenantId, subjectId = "plan-1") =>
  createApprovalRequest({
    tenantId,
    organizationId: ORG,
    subject: "execution_plan",
    subjectId,
    agentId: "agent-1",
    riskLevel: "high",
  });

const sessionIn = (tenantId: TenantId, agentId = "agent-1") =>
  createReasoningSession({
    tenantId,
    organizationId: ORG,
    agentId,
    purpose: "Why is attendance short by two?",
  });

const invocationIn = (tenantId: TenantId, planId: string | null, agentId = "agent-1") =>
  authorizeToolInvocation({
    tenantId,
    organizationId: ORG,
    agent: {
      id: agentId,
      status: "active",
      autonomyLevel: "bounded",
      grantedCapabilityKeys: ["attendance.read"],
    },
    tool: toToolView(activateTool(toolIn(tenantId))),
    planId,
    ordinal: 1,
  });

/**
 * Tenancy is the invariant every one of these repositories exists to hold. RLS is the barrier that cannot be
 * forgotten, but it lives in the adapter; what is asserted here is that the port itself filters too, so a
 * mis-scoped read is a miss in both layers rather than only in the one nobody reviews.
 */
describe("in-memory ports: tenant isolation", () => {
  it("keeps agents inside their tenant on every read", async () => {
    const repo = new InMemoryAgentRepository();
    const mine = agentIn(T1);
    await repo.save(mine);
    await repo.save(agentIn(T2));

    expect(await repo.findById(T1, mine.id)).toEqual(mine);
    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.findByKey(T1, "scheduler")).toEqual(mine);
    expect(await repo.listByTenant(T1)).toHaveLength(1);
    expect(await repo.listByTenant(T2)).toHaveLength(1);
  });

  it("refuses to remove another tenant's agent", async () => {
    const repo = new InMemoryAgentRepository();
    const mine = agentIn(T1);
    await repo.save(mine);

    await repo.remove(T2, mine.id);
    expect(await repo.findById(T1, mine.id)).toEqual(mine);

    await repo.remove(T1, mine.id);
    expect(await repo.findById(T1, mine.id)).toBeNull();
  });

  it("keeps the capability catalog inside its tenant, by id, key and bulk key", async () => {
    const repo = new InMemoryToolRepository();
    const mine = toolIn(T1);
    await repo.save(mine);
    await repo.save(toolIn(T2));

    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.findByKey(T2, "attendance.read")).not.toEqual(mine);
    expect(await repo.findManyByKeys(T1, ["attendance.read"])).toEqual([mine]);
    expect(await repo.findManyByKeys(T1, ["fees.charge"])).toEqual([]);
  });

  it("loads only the catalog entries a plan actually names", async () => {
    const repo = new InMemoryToolRepository();
    await repo.save(toolIn(T1, "attendance.read"));
    await repo.save(toolIn(T1, "guardian.notify"));
    await repo.save(toolIn(T1, "fees.charge"));

    const loaded = await repo.findManyByKeys(T1, ["attendance.read", "fees.charge"]);
    expect(loaded.map((tool) => tool.key).sort()).toEqual(["attendance.read", "fees.charge"]);
  });

  it("indexes plans by agent and by the reasoning that produced them", async () => {
    const repo = new InMemoryExecutionPlanRepository();
    const fromSession = planIn(T1, "agent-1", "session-9");
    await repo.save(fromSession);
    await repo.save(planIn(T1, "agent-2"));
    await repo.save(planIn(T2, "agent-1", "session-9"));

    expect(await repo.listByAgent(T1, "agent-1")).toEqual([fromSession]);
    expect(await repo.listBySession(T1, "session-9")).toEqual([fromSession]);
    expect(await repo.listBySession(T2, "session-9")).toHaveLength(1);
    expect(await repo.listByTenant(T1)).toHaveLength(2);
  });

  it("keeps steps with their plan rather than storing them apart", async () => {
    const repo = new InMemoryExecutionPlanRepository();
    const withStep = addPlanStep(planIn(T1), { capabilityKey: "attendance.read" });
    await repo.save(withStep);

    const loaded = await repo.findById(T1, withStep.id);
    expect(loaded?.steps).toHaveLength(1);
    expect(loaded?.steps[0]?.capabilityKey).toBe("attendance.read");
  });

  it("finds only a *pending* request as the open gate in front of a subject", async () => {
    const repo = new InMemoryApprovalRequestRepository();
    const request = approvalIn(T1, "plan-7");
    await repo.save(request);

    expect(await repo.findOpenForSubject(T1, "execution_plan", "plan-7")).toEqual(request);

    await repo.save(approveRequest(request, { decidedByUserId: "user-1" }));
    expect(await repo.findOpenForSubject(T1, "execution_plan", "plan-7")).toBeNull();
    expect(await repo.listBySubject(T1, "execution_plan", "plan-7")).toHaveLength(1);
    expect(await repo.listPending(T1)).toHaveLength(0);
  });

  it("does not let one tenant see another's approval queue", async () => {
    const repo = new InMemoryApprovalRequestRepository();
    await repo.save(approvalIn(T1));
    await repo.save(approvalIn(T2));

    expect(await repo.listPending(T1)).toHaveLength(1);
    expect(await repo.findOpenForSubject(T2, "execution_plan", "plan-1")).not.toBeNull();
  });

  it("indexes invocations by the plan and the agent they belong to", async () => {
    const repo = new InMemoryToolInvocationRepository();
    const inPlan = invocationIn(T1, "plan-3");
    await repo.save(inPlan);
    await repo.save(invocationIn(T1, null, "agent-2"));

    expect(await repo.listByPlan(T1, "plan-3")).toEqual([inPlan]);
    expect(await repo.listByAgent(T1, "agent-1")).toEqual([inPlan]);
    expect(await repo.listByAgent(T1, "agent-2")).toHaveLength(1);
    expect(await repo.listByPlan(T2, "plan-3")).toEqual([]);
  });

  it("keeps reasoning sessions inside their tenant and indexed by agent", async () => {
    const repo = new InMemoryReasoningSessionRepository();
    const mine = sessionIn(T1);
    await repo.save(mine);
    await repo.save(sessionIn(T2));

    expect(await repo.findById(T1, mine.id)).toEqual(mine);
    expect(await repo.findById(T2, mine.id)).toBeNull();
    expect(await repo.listByAgent(T1, "agent-1")).toEqual([mine]);
    expect(await repo.listByAgent(T1, "agent-9")).toEqual([]);
  });
});

/**
 * Three of the six repositories have no `remove`, and that is a design position rather than an omission: an
 * approval is the record of who allowed what, an invocation is the record of what an agent did to an
 * institution, and a session is the record of why. None of the three is a draft, so none of the three is
 * discardable. The check is structural — a delete path that does not exist cannot be reached by mistake.
 */
describe("in-memory ports: what cannot be deleted", () => {
  it("offers no way to delete an approval, an invocation or a reasoning session", () => {
    expect("remove" in new InMemoryApprovalRequestRepository()).toBe(false);
    expect("remove" in new InMemoryToolInvocationRepository()).toBe(false);
    expect("remove" in new InMemoryReasoningSessionRepository()).toBe(false);
  });

  it("offers one for the aggregates that can still be drafts", () => {
    expect(typeof new InMemoryAgentRepository().remove).toBe("function");
    expect(typeof new InMemoryToolRepository().remove).toBe("function");
    expect(typeof new InMemoryExecutionPlanRepository().remove).toBe("function");
  });
});
