import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { ApprovalService } from "./approval-service";
import { createApprovalRequest } from "./approval-request";
import {
  AnonymousApprovalDecisionError,
  ApprovalAlreadyDecidedError,
  ApprovalRequestNotFoundError,
  ApprovalSubjectMismatchError,
} from "./errors";
import { InMemoryApprovalRequestRepository } from "./ports";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;

describe("ApprovalService", () => {
  let repository: InMemoryApprovalRequestRepository;
  let published: DomainEvent[];
  let svc: ApprovalService;

  beforeEach(() => {
    repository = new InMemoryApprovalRequestRepository();
    published = [];
    svc = new ApprovalService({
      repository,
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const raise = async (
    subject: "execution_plan" | "tool_invocation",
    subjectId: string,
    expiresAt: ISODateString | null = null,
    tenantId: TenantId = TENANT,
  ) => {
    const request = createApprovalRequest({
      tenantId,
      organizationId: ORG,
      subject,
      subjectId,
      agentId: "agent-1",
      capabilityKey: "guardian.notify",
      reasons: ["irreversible_action"],
      riskLevel: "high",
      expiresAt,
    });
    await repository.save(request);
    return request;
  };

  it("shows the queue as everything still waiting on a person, in this tenant only", async () => {
    await raise("tool_invocation", "agent-1:guardian.notify");
    await raise("execution_plan", "plan-1");
    await raise("execution_plan", "plan-2", null, OTHER);

    expect(await svc.listPending(TENANT)).toHaveLength(2);
    expect(await svc.listPending(OTHER)).toHaveLength(1);
    expect(await svc.list(TENANT)).toHaveLength(2);
  });

  it("finds the open gate standing in front of a subject, and nothing once it is answered", async () => {
    const request = await raise("tool_invocation", "agent-1:guardian.notify");

    expect(await svc.findOpenFor(TENANT, "tool_invocation", "agent-1:guardian.notify")).toEqual(
      request,
    );

    await svc.approve(TENANT, request.id, { decidedByUserId: "user-3" });
    expect(await svc.findOpenFor(TENANT, "tool_invocation", "agent-1:guardian.notify")).toBeNull();
  });

  it("keeps every request ever raised about a subject as that subject's audit trail", async () => {
    const first = await raise("tool_invocation", "agent-1:guardian.notify");
    await svc.reject(TENANT, first.id, { decidedByUserId: "user-3" });
    await raise("tool_invocation", "agent-1:guardian.notify");

    expect(
      await svc.listBySubject(TENANT, "tool_invocation", "agent-1:guardian.notify"),
    ).toHaveLength(2);
  });

  it("records a named person letting a single call through", async () => {
    const request = await raise("tool_invocation", "agent-1:guardian.notify");
    const decided = await svc.approve(TENANT, request.id, {
      decidedByUserId: "user-3",
      note: "Guardian already expects the call",
    });

    expect(decided.decision).toBe("approved");
    expect(decided.decidedByUserId).toBe("user-3");
    expect(decided.decidedAt).not.toBeNull();
    expect(published.map((event) => event.type)).toEqual(["ai.approval.granted"]);
  });

  it("records a refusal the same way", async () => {
    const request = await raise("tool_invocation", "agent-1:guardian.notify");
    const decided = await svc.reject(TENANT, request.id, { decidedByUserId: "user-3" });

    expect(decided.decision).toBe("rejected");
    expect(published.map((event) => event.type)).toEqual(["ai.approval.rejected"]);
  });

  it("refuses an anonymous decision — accountability is the whole point of the gate", async () => {
    const request = await raise("tool_invocation", "agent-1:guardian.notify");

    await expect(svc.approve(TENANT, request.id, { decidedByUserId: "  " })).rejects.toThrow(
      AnonymousApprovalDecisionError,
    );
  });

  it("refuses to answer a question that has already been answered", async () => {
    const request = await raise("tool_invocation", "agent-1:guardian.notify");
    await svc.approve(TENANT, request.id, { decidedByUserId: "user-3" });

    await expect(svc.reject(TENANT, request.id, { decidedByUserId: "user-4" })).rejects.toThrow(
      ApprovalAlreadyDecidedError,
    );
  });

  /**
   * Deciding a plan-level request here would leave the plan sitting in `awaiting_approval` behind a request
   * marked `approved` — an audit trail showing a person allowing something that then never ran, with nobody able
   * to say why. Plan decisions go through the plan service, which moves both together.
   */
  it("refuses a plan-level decision, because it could not honour it end to end", async () => {
    const request = await raise("execution_plan", "plan-1");

    await expect(svc.approve(TENANT, request.id, { decidedByUserId: "user-3" })).rejects.toThrow(
      ApprovalSubjectMismatchError,
    );
    await expect(svc.reject(TENANT, request.id, { decidedByUserId: "user-3" })).rejects.toThrow(
      ApprovalSubjectMismatchError,
    );
    expect(await svc.listPending(TENANT)).toHaveLength(1);
  });

  /** Silence is recorded as silence, never as a refusal — and an expired gate leaves nobody's queue filling. */
  it("expires the requests whose deadline has passed, and only those", async () => {
    const due = await raise(
      "tool_invocation",
      "agent-1:guardian.notify",
      "2026-01-01T00:00:00.000Z" as ISODateString,
    );
    const later = await raise(
      "execution_plan",
      "plan-1",
      "2026-12-31T00:00:00.000Z" as ISODateString,
    );
    const open = await raise("execution_plan", "plan-2");

    const expired = await svc.expireDue(TENANT, "2026-06-01T00:00:00.000Z" as ISODateString);

    expect(expired.map((request) => request.id)).toEqual([due.id]);
    expect(expired[0]?.decision).toBe("expired");
    expect(expired[0]?.decidedByUserId).toBeNull();
    expect((await svc.get(TENANT, later.id)).decision).toBe("pending");
    expect((await svc.get(TENANT, open.id)).decision).toBe("pending");
    expect(published.map((event) => event.type)).toEqual(["ai.approval.expired"]);
  });

  /** The sweep applies to every subject, plan-level included: a plan whose gate timed out waits on nobody. */
  it("expires a plan-level request too, even though it will not decide one", async () => {
    const request = await raise(
      "execution_plan",
      "plan-1",
      "2026-01-01T00:00:00.000Z" as ISODateString,
    );

    const expired = await svc.expireDue(TENANT, "2026-06-01T00:00:00.000Z" as ISODateString);
    expect(expired.map((r) => r.id)).toEqual([request.id]);
  });

  it("does not sweep another tenant's queue", async () => {
    await raise(
      "tool_invocation",
      "agent-1:guardian.notify",
      "2026-01-01T00:00:00.000Z" as ISODateString,
      OTHER,
    );

    expect(await svc.expireDue(TENANT, "2026-06-01T00:00:00.000Z" as ISODateString)).toEqual([]);
    expect(await svc.listPending(OTHER)).toHaveLength(1);
  });

  it("does not answer for another tenant's request, on read or on decision", async () => {
    const request = await raise("tool_invocation", "agent-1:guardian.notify");

    await expect(svc.get(OTHER, request.id)).rejects.toThrow(ApprovalRequestNotFoundError);
    await expect(svc.approve(OTHER, request.id, { decidedByUserId: "user-3" })).rejects.toThrow(
      ApprovalRequestNotFoundError,
    );
    expect(await svc.findOpenFor(OTHER, "tool_invocation", "agent-1:guardian.notify")).toBeNull();
  });
});
