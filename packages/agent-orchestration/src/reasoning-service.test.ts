import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { ReasoningService } from "./reasoning-service";
import { AgentService } from "./agent-service";
import { ExecutionPlanService } from "./execution-plan-service";
import { ToolService } from "./tool-service";
import {
  AgentNotFoundError,
  ExecutionPlanNotFoundError,
  InvalidSessionTransitionError,
  KnowledgeOutsideRetrievalError,
  OrganizationNotFoundForAgentError,
  PlanAgentMismatchError,
  ReasoningSessionNotFoundError,
  ReasoningTraceNotFoundError,
  SessionClosedError,
  UngroundedConclusionError,
  UngroundedSessionError,
  UnknownEvidenceError,
  UnsourcedRetrievalError,
} from "./errors";
import {
  InMemoryAgentRepository,
  InMemoryApprovalRequestRepository,
  InMemoryExecutionPlanRepository,
  InMemoryReasoningSessionRepository,
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

describe("ReasoningService", () => {
  let repository: InMemoryReasoningSessionRepository;
  let agents: InMemoryAgentRepository;
  let capabilities: InMemoryToolRepository;
  let plans: InMemoryExecutionPlanRepository;
  let published: DomainEvent[];
  let svc: ReasoningService;
  let agentSvc: AgentService;
  let planSvc: ExecutionPlanService;
  let agentId: string;

  const open = (purpose = "Why is attendance down in year 9?", agent = agentId) =>
    svc.open({ tenantId: TENANT, organizationId: ORG, agentId: agent, purpose });

  beforeEach(async () => {
    repository = new InMemoryReasoningSessionRepository();
    agents = new InMemoryAgentRepository();
    capabilities = new InMemoryToolRepository();
    plans = new InMemoryExecutionPlanRepository();
    published = [];

    agentSvc = new AgentService({ repository: agents, capabilities, organizations: orgDir });
    planSvc = new ExecutionPlanService({
      repository: plans,
      agents,
      capabilities,
      approvals: new InMemoryApprovalRequestRepository(),
      organizations: orgDir,
    });
    svc = new ReasoningService({
      repository,
      agents,
      plans,
      organizations: orgDir,
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });

    const catalog = new ToolService({ repository: capabilities, organizations: orgDir });
    const tool = await catalog.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance.read",
      name: "Read attendance",
      capabilityDomain: "attendance",
      effect: "read",
      riskLevel: "low",
      reversibility: "reversible",
    });
    await catalog.activate(TENANT, tool.id);

    const agent = await agentSvc.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-assistant",
      name: "Attendance assistant",
      autonomyLevel: "bounded",
    });
    agentId = agent.id;
  });

  it("opens a session having concluded nothing", async () => {
    const session = await open();

    expect(session.status).toBe("open");
    expect(session.traces).toEqual([]);
    expect(session.executionPlanId).toBeNull();
    expect(published.map((event) => event.type)).toEqual(["ai.reasoning_session.opened"]);
  });

  it("refuses a session in the name of an agent or an organization that does not exist", async () => {
    await expect(open("Why?", "55555555-5555-4555-8555-555555555555")).rejects.toThrow(
      AgentNotFoundError,
    );
    await expect(
      svc.open({
        tenantId: TENANT,
        organizationId: "org-9" as Uuid,
        agentId,
        purpose: "Why?",
      }),
    ).rejects.toThrow(OrganizationNotFoundForAgentError);
  });

  /**
   * Reasoning invokes nothing and changes nothing outside its own record, so gating it on the agent's status
   * would buy no safety. The gate that matters stands at invocation, where status is checked on every call.
   */
  it("opens for a drafted agent, because reasoning is not acting", async () => {
    const session = await open();
    expect(session.agentId).toBe(agentId);
    expect((await agentSvc.get(TENANT, agentId as Uuid)).status).toBe("draft");
  });

  it("brings knowledge in only from the graph, and only as a retrieval", async () => {
    const session = await open();
    const withKnowledge = await svc.retrieve(TENANT, session.id, "Year 9 absence rose in May", [
      "assertion-1",
      "assertion-2",
    ]);

    expect(withKnowledge.traces[0]?.kind).toBe("retrieval");
    expect(withKnowledge.traces[0]?.source).toBe("knowledge_graph");
    expect(await svc.knowledgeRefs(TENANT, session.id)).toEqual(["assertion-1", "assertion-2"]);
    expect(published.at(-1)?.type).toBe("ai.reasoning_session.trace_recorded");

    await expect(svc.retrieve(TENANT, session.id, "From somewhere else", [])).rejects.toThrow(
      UnsourcedRetrievalError,
    );
    await expect(
      svc.record(TENANT, session.id, {
        kind: "observation",
        statement: "Seen it myself",
        knowledgeRefs: ["assertion-3"],
      }),
    ).rejects.toThrow(KnowledgeOutsideRetrievalError);
  });

  it("refuses a conclusion resting on nothing, or on something that is not there", async () => {
    const session = await open();

    await expect(svc.infer(TENANT, session.id, "Absence is rising", [])).rejects.toThrow(
      UngroundedConclusionError,
    );
    await expect(
      svc.decide(TENANT, session.id, "Call the guardians", ["trace-nope"]),
    ).rejects.toThrow(UnknownEvidenceError);
  });

  it("keeps the chain from retrieval to decision, and can be read back a step at a time", async () => {
    const session = await open();
    const retrieved = await svc.retrieve(TENANT, session.id, "Year 9 absence rose in May", [
      "assertion-1",
    ]);
    const retrievalId = retrieved.traces[0]?.id ?? "";

    const observed = await svc.observe(TENANT, session.id, "Three guardians unreachable", 80);
    const observationId = observed.traces[1]?.id ?? "";

    const inferred = await svc.infer(
      TENANT,
      session.id,
      "Contact details are stale",
      [retrievalId, observationId],
      70,
    );
    const inferenceId = inferred.traces[2]?.id ?? "";

    const decided = await svc.decide(TENANT, session.id, "Refresh guardian contacts", [
      inferenceId,
    ]);
    expect(decided.traces.map((trace) => trace.kind)).toEqual([
      "retrieval",
      "observation",
      "inference",
      "decision",
    ]);
    expect((await svc.trace(TENANT, session.id, observationId)).confidence).toBe(80);
    await expect(svc.trace(TENANT, session.id, "trace-nope")).rejects.toThrow(
      ReasoningTraceNotFoundError,
    );

    const grounding = await svc.grounding(TENANT, session.id);
    expect(grounding).toMatchObject({
      traceCount: 4,
      retrievalCount: 1,
      derivedCount: 2,
      groundedDerivedCount: 2,
      knowledgeRefCount: 1,
      grounded: true,
    });

    const summary = await svc.summarize(TENANT, session.id);
    expect(summary.decisionCount).toBe(1);
    expect(summary.decisionConfidence).toBe(70);
  });

  /** A link between reasoning and action must point at something real, drafted by this session's own agent. */
  it("attaches only a plan that exists and belongs to the same agent", async () => {
    const session = await open();

    await expect(
      svc.attachPlan(TENANT, session.id, "66666666-6666-4666-8666-666666666666"),
    ).rejects.toThrow(ExecutionPlanNotFoundError);

    const other = await agentSvc.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "fees-assistant",
      name: "Fees assistant",
      autonomyLevel: "advisory",
    });
    const theirs = await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId: other.id,
      goal: "Chase fees",
    });
    await expect(svc.attachPlan(TENANT, session.id, theirs.id)).rejects.toThrow(
      PlanAgentMismatchError,
    );

    const mine = await planSvc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      agentId,
      goal: "Chase absences",
    });
    const linked = await svc.attachPlan(TENANT, session.id, mine.id);
    expect(linked.executionPlanId).toBe(mine.id);
    expect(await planSvc.listBySession(TENANT, session.id)).toEqual([]);
  });

  it("closes a session whose reasoning holds, and will not reopen it", async () => {
    const session = await open();
    const observed = await svc.observe(TENANT, session.id, "Three guardians unreachable");
    const observationId = observed.traces[0]?.id ?? "";
    await svc.decide(TENANT, session.id, "Refresh guardian contacts", [observationId]);

    const concluded = await svc.conclude(TENANT, session.id, "Refresh guardian contacts");
    expect(concluded.status).toBe("concluded");
    expect(concluded.conclusion).toBe("Refresh guardian contacts");
    expect(concluded.concludedAt).not.toBeNull();
    expect(published.at(-1)?.type).toBe("ai.reasoning_session.concluded");

    await expect(svc.conclude(TENANT, session.id, "Again")).rejects.toThrow(
      InvalidSessionTransitionError,
    );
  });

  it("reports an unsound session by the steps that make it unsound", async () => {
    const session = await open();
    const observed = await svc.observe(TENANT, session.id, "Three guardians unreachable");
    const observationId = observed.traces[0]?.id ?? "";
    await svc.infer(TENANT, session.id, "Contact details are stale", [observationId]);

    // Reach past the service to plant a derived step resting on nothing — a record an older writer could leave.
    const planted = await repository.findById(TENANT, session.id);
    await repository.save({
      ...(planted ?? session),
      traces: [
        ...(planted?.traces ?? []),
        {
          id: "trace-loose" as Uuid,
          ordinal: 3,
          kind: "decision" as const,
          statement: "Act anyway",
          source: null,
          knowledgeRefs: [],
          dependsOn: [],
          confidence: 100,
          createdAt: "2026-01-01T00:00:00.000Z" as ISODateString,
        },
      ],
    });

    expect((await svc.grounding(TENANT, session.id)).ungroundedTraceIds).toEqual(["trace-loose"]);
    await expect(svc.conclude(TENANT, session.id, "Act anyway")).rejects.toThrow(
      UngroundedSessionError,
    );
  });

  /**
   * Abandonment is deliberately not subject to the grounding check: a session that abandons claims to have
   * concluded nothing, and forcing it to be sound first would leave unsound reasoning open forever.
   */
  it("abandons a session whatever state its reasoning is in, and closes it for good", async () => {
    const session = await open();
    await svc.observe(TENANT, session.id, "Not going anywhere");

    const abandoned = await svc.abandon(TENANT, session.id);
    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.conclusion).toBeNull();
    expect(published.at(-1)?.type).toBe("ai.reasoning_session.abandoned");

    await expect(svc.observe(TENANT, session.id, "One more thing")).rejects.toThrow(
      SessionClosedError,
    );
  });

  /**
   * There is no `remove` here, and its absence is the design. A reasoning session is the answer to "why did the
   * agent do that", and an answer that can be deleted once it becomes inconvenient is not one.
   */
  it("offers no way to erase a session", () => {
    expect("remove" in svc).toBe(false);
  });

  it("lists a tenant's sessions, and an agent's own", async () => {
    const session = await open();
    await open("A second question");

    expect(await svc.list(TENANT)).toHaveLength(2);
    expect(await svc.listByAgent(TENANT, agentId)).toHaveLength(2);
    expect(await svc.listByAgent(TENANT, "77777777-7777-4777-8777-777777777777")).toEqual([]);
    expect(session.tenantId).toBe(TENANT);
  });

  it("does not answer for another tenant's session, on read or on write", async () => {
    const session = await open();

    await expect(svc.get(OTHER, session.id)).rejects.toThrow(ReasoningSessionNotFoundError);
    await expect(svc.abandon(OTHER, session.id)).rejects.toThrow(ReasoningSessionNotFoundError);
    expect(await svc.list(OTHER)).toEqual([]);
  });
});
