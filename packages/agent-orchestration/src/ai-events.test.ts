import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { activateAgent, createAgentDefinition, grantCapability } from "./agent";
import { approveRequest, createApprovalRequest, rejectRequest } from "./approval-request";
import {
  AGENT_CAPABILITY_GRANTED,
  APPROVAL_GRANTED,
  INVOCATION_DENIED,
  PLAN_SUBMITTED,
  SESSION_TRACE_RECORDED,
  agentCapabilityGranted,
  agentRegistered,
  approvalGranted,
  approvalRejected,
  approvalRequested,
  capabilityRegistered,
  invocationAuthorized,
  invocationDenied,
  planDrafted,
  planSubmitted,
  sessionConcluded,
  sessionOpened,
  sessionTraceRecorded,
} from "./ai-events";
import { addPlanStep, createExecutionPlan, submitExecutionPlan } from "./execution-plan";
import { concludeSession, createReasoningSession, retrieveKnowledge } from "./reasoning-session";
import { activateTool, createToolDefinition, toToolView } from "./tool";
import { authorizeToolInvocation } from "./tool-invocation";

const TENANT = "tenant-1" as TenantId;
const ORG = "org-1" as Uuid;

/**
 * Every piece of free text this domain holds, gathered in one place. Each string below is written into an
 * aggregate and must never reappear in an event payload — that is the whole of the test.
 */
const PURPOSE = "Chase unexplained absences before the attendance return is filed";
const GOAL = "Reconcile Tuesday's attendance against the guardian notifications";
const INTENT = "Read the register for 7B before deciding whether to notify";
const STATEMENT = "Rahul Menon was marked absent in period three but present in period four";
const CONCLUSION = "The period-three mark is a data-entry error and should be corrected";
const NOTE = "Approved by the head of year after speaking to the form tutor";
const APPROVER = "user-8814";
const DESCRIPTION = "Sends an SMS to the guardian on the student's contact record";

const agent = activateAgent(
  grantCapability(
    createAgentDefinition({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-assistant",
      name: "Attendance assistant",
      autonomyLevel: "bounded",
      purpose: PURPOSE,
    }),
    "guardian.notify",
  ),
);

const tool = activateTool(
  createToolDefinition({
    tenantId: TENANT,
    organizationId: ORG,
    key: "guardian.notify",
    name: "Notify guardian",
    description: DESCRIPTION,
    capabilityDomain: "engagement",
    effect: "write",
    riskLevel: "high",
    reversibility: "irreversible",
  }),
);

const plan = addPlanStep(
  createExecutionPlan({
    tenantId: TENANT,
    organizationId: ORG,
    agentId: agent.id,
    goal: GOAL,
  }),
  { capabilityKey: "guardian.notify", intent: INTENT },
);

const submitted = submitExecutionPlan(plan, [toToolView(tool)]);

const request = createApprovalRequest({
  tenantId: TENANT,
  organizationId: ORG,
  subject: "execution_plan",
  subjectId: submitted.id,
  agentId: agent.id,
  capabilityKey: "guardian.notify",
  reasons: ["irreversible_action"],
  riskLevel: "high",
});

const decided = approveRequest(request, { decidedByUserId: APPROVER, note: NOTE });

const invocation = authorizeToolInvocation({
  tenantId: TENANT,
  organizationId: ORG,
  agent: {
    id: agent.id,
    status: "active",
    autonomyLevel: "bounded",
    grantedCapabilityKeys: ["guardian.notify"],
  },
  tool: toToolView(tool),
  approval: approveRequest(
    createApprovalRequest({
      tenantId: TENANT,
      organizationId: ORG,
      subject: "tool_invocation",
      subjectId: `${agent.id}:guardian.notify`,
      agentId: agent.id,
      capabilityKey: "guardian.notify",
      riskLevel: "high",
    }),
    { decidedByUserId: APPROVER, note: NOTE },
  ),
});

const session = retrieveKnowledge(
  createReasoningSession({
    tenantId: TENANT,
    organizationId: ORG,
    agentId: agent.id,
    purpose: PURPOSE,
  }),
  STATEMENT,
  ["assertion-41", "assertion-42"],
  80,
);

const everyEvent: readonly DomainEvent[] = [
  agentRegistered(agent),
  agentCapabilityGranted(agent, "guardian.notify"),
  capabilityRegistered(tool),
  planDrafted(plan),
  planSubmitted(submitted),
  approvalRequested(request),
  approvalGranted(decided),
  approvalRejected(rejectRequest(request, { decidedByUserId: APPROVER, note: NOTE })),
  invocationAuthorized(invocation),
  invocationDenied({
    tenantId: TENANT,
    organizationId: ORG,
    agentId: agent.id,
    capabilityKey: "fees.charge",
    riskLevel: "critical",
    reasons: ["capability_not_granted"],
  }),
  sessionOpened(session),
  sessionTraceRecorded(session),
  sessionConcluded(concludeSession(session, CONCLUSION)),
];

/**
 * The rule the whole event surface is built to hold: an event says that something happened and to which record,
 * never what was said, reasoned, intended or decided, and never by whom. An event bus fans out to subscribers
 * that were never authorized to read the underlying work — a projection, a webhook, an analytics sink — so a
 * payload carrying a student's name or an approver's identity would leak it to every one of them at once.
 */
describe("ai events: nothing but ids, keys, statuses and counts", () => {
  const secrets = [PURPOSE, GOAL, INTENT, STATEMENT, CONCLUSION, NOTE, APPROVER, DESCRIPTION];

  it.each(everyEvent.map((event) => [event.type, event] as const))(
    "%s carries no free text and no person",
    (_type, event) => {
      const serialized = JSON.stringify(event.payload);
      for (const secret of secrets) {
        expect(serialized).not.toContain(secret);
      }
    },
  );

  it("stamps every event with its tenant", () => {
    for (const event of everyEvent) {
      expect(event.metadata.tenantId).toBe(TENANT);
    }
  });

  it("namespaces every type under ai.", () => {
    for (const event of everyEvent) {
      expect(event.type.startsWith("ai.")).toBe(true);
    }
  });
});

describe("ai events: what each one does say", () => {
  it("describes an agent by key, autonomy, status and how much reach it has", () => {
    const event = agentRegistered(agent);
    expect(event.payload).toMatchObject({
      agentId: agent.id,
      key: "attendance-assistant",
      autonomyLevel: "bounded",
      status: "active",
      grantedCapabilityCount: 1,
    });
  });

  it("names the capability on a grant, so a permission change is auditable from the event alone", () => {
    const event = agentCapabilityGranted(agent, "guardian.notify");
    expect(event.type).toBe(AGENT_CAPABILITY_GRANTED);
    expect(event.payload.capabilityKey).toBe("guardian.notify");
  });

  it("describes a capability by its risk profile rather than its wording", () => {
    expect(capabilityRegistered(tool).payload).toMatchObject({
      key: "guardian.notify",
      capabilityDomain: "engagement",
      effect: "write",
      riskLevel: "high",
      reversibility: "irreversible",
    });
  });

  it("counts a plan's steps and how many have settled, never what they intend", () => {
    const event = planSubmitted(submitted);
    expect(event.type).toBe(PLAN_SUBMITTED);
    expect(event.payload).toMatchObject({
      planId: submitted.id,
      agentId: agent.id,
      status: "awaiting_approval",
      stepCount: 1,
      settledStepCount: 0,
      requiresApproval: true,
    });
  });

  it("records that a request was decided without recording who decided it", () => {
    const event = approvalGranted(decided);
    expect(event.type).toBe(APPROVAL_GRANTED);
    expect(event.payload.decision).toBe("approved");
    expect(event.payload).not.toHaveProperty("decidedByUserId");
    expect(event.payload).not.toHaveProperty("decisionNote");
  });

  it("carries the reason codes a request was raised for, because codes are safe", () => {
    expect(approvalRequested(request).payload.reasons).toEqual(["irreversible_action"]);
  });

  it("announces a refusal even though no invocation record exists for it", () => {
    const event = invocationDenied({
      tenantId: TENANT,
      organizationId: ORG,
      agentId: agent.id,
      planId: "plan-2",
      stepId: "step-4",
      capabilityKey: "fees.charge",
      riskLevel: "critical",
      reasons: ["capability_not_granted"],
    });

    expect(event.type).toBe(INVOCATION_DENIED);
    expect(event.payload).toMatchObject({
      agentId: agent.id,
      planId: "plan-2",
      stepId: "step-4",
      capabilityKey: "fees.charge",
      authorizationOutcome: "denied",
      authorizationReasons: ["capability_not_granted"],
    });
  });

  it("says an invocation was human-gated by naming the request, not the approver", () => {
    const event = invocationAuthorized(invocation);
    expect(event.payload.authorizationOutcome).toBe("requires_approval");
    expect(event.payload.approvalRequestId).toBe(invocation.approvalRequestId);
  });

  it("counts a session's reasoning and the knowledge it rested on", () => {
    expect(sessionOpened(session).payload).toMatchObject({
      sessionId: session.id,
      agentId: agent.id,
      status: "open",
      traceCount: 1,
      knowledgeRefCount: 2,
      executionPlanId: null,
    });
  });

  it("describes the step just recorded by kind, position and confidence only", () => {
    const event = sessionTraceRecorded(session);
    expect(event.type).toBe(SESSION_TRACE_RECORDED);
    expect(event.payload).toMatchObject({
      traceId: session.traces[0]?.id,
      traceKind: "retrieval",
      ordinal: 1,
      confidence: 80,
    });
  });

  it("reports a conclusion happened without reporting the conclusion", () => {
    const event = sessionConcluded(concludeSession(session, CONCLUSION));
    expect(event.payload.status).toBe("concluded");
    expect(JSON.stringify(event.payload)).not.toContain(CONCLUSION);
  });
});
