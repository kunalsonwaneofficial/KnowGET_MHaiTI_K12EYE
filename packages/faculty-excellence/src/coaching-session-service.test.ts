import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  acceptEngagement,
  type CoachingEngagement,
  completeEngagement,
  proposeEngagement,
} from "./coaching-engagement";
import { CoachingSessionService } from "./coaching-session-service";
import { CoachingEngagementNotFoundError, EngagementNotActiveError } from "./errors";
import { InMemoryCoachingEngagementRepository, InMemoryCoachingSessionRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const COACH = "33333333-3333-3333-3333-333333333333" as Uuid;
const COACHEE = "44444444-4444-4444-4444-444444444444" as Uuid;

const engagement = (): CoachingEngagement =>
  proposeEngagement({
    tenantId: TENANT,
    organizationId: ORG,
    coachId: COACH,
    coacheeId: COACHEE,
    focus: "Questioning",
  });

async function harness(seed: CoachingEngagement[] = []) {
  const engagements = new InMemoryCoachingEngagementRepository();
  for (const e of seed) {
    await engagements.save(e);
  }
  const events: DomainEvent[] = [];
  const svc = new CoachingSessionService({
    repository: new InMemoryCoachingSessionRepository(),
    engagements,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

describe("CoachingSessionService", () => {
  it("logs a session against an active engagement, deriving the organization", async () => {
    const active = acceptEngagement(engagement());
    const { svc, events } = await harness([active]);
    const session = await svc.log({
      tenantId: TENANT,
      engagementId: active.id,
      sessionDate: "2026-03-15",
      notes: "Discussed pacing",
    });
    expect(session.organizationId).toBe(ORG);
    expect(events.map((e) => e.type)).toEqual(["faculty.coaching.session_logged"]);
    expect(await svc.listForEngagement(TENANT, active.id)).toHaveLength(1);
  });

  it("rejects logging against an unknown or non-active engagement", async () => {
    const proposed = engagement(); // still proposed, not active
    const completed = completeEngagement(acceptEngagement(engagement()));
    const { svc } = await harness([proposed, completed]);
    await expect(
      svc.log({ tenantId: TENANT, engagementId: "00000000-0000-0000-0000-000000000000" as Uuid }),
    ).rejects.toBeInstanceOf(CoachingEngagementNotFoundError);
    await expect(svc.log({ tenantId: TENANT, engagementId: proposed.id })).rejects.toBeInstanceOf(
      EngagementNotActiveError,
    );
    await expect(svc.log({ tenantId: TENANT, engagementId: completed.id })).rejects.toBeInstanceOf(
      EngagementNotActiveError,
    );
  });
});
