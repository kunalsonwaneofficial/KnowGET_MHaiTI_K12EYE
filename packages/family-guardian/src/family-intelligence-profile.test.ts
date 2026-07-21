import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyInteractionSummaryError, InvalidParticipationRateError } from "./errors";
import {
  createFamilyIntelligenceProfile,
  recordInteraction,
  updateIndicators,
} from "./family-intelligence-profile";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const FAMILY = "33333333-3333-3333-3333-333333333333" as Uuid;

const base = () =>
  createFamilyIntelligenceProfile({ tenantId: TENANT, organizationId: ORG, familyId: FAMILY });

describe("FamilyIntelligenceProfile aggregate", () => {
  it("creates an empty profile with null indicators and no interactions", () => {
    const p = base();
    expect(p.indicators).toEqual({
      engagementLevel: null,
      communicationResponsiveness: null,
      participationRate: null,
      consentCompliance: null,
    });
    expect(p.interactions).toEqual([]);
  });

  it("merges indicator updates", () => {
    const p = updateIndicators(base(), { engagementLevel: "high", participationRate: 0.75 });
    expect(p.indicators.engagementLevel).toBe("high");
    expect(p.indicators.participationRate).toBe(0.75);
    expect(p.indicators.consentCompliance).toBeNull();
  });

  it("validates the participation rate is within 0..1", () => {
    expect(() => updateIndicators(base(), { participationRate: -0.1 })).toThrow(
      InvalidParticipationRateError,
    );
    expect(() => updateIndicators(base(), { participationRate: 1.5 })).toThrow(
      InvalidParticipationRateError,
    );
    expect(updateIndicators(base(), { participationRate: 0 }).indicators.participationRate).toBe(0);
  });

  it("appends interactions to an immutable timeline", () => {
    let p = recordInteraction(base(), { kind: "meeting", summary: "  parent-teacher meeting  " });
    p = recordInteraction(p, { kind: "message", summary: "reminder sent" });
    expect(p.interactions).toHaveLength(2);
    expect(p.interactions[0]?.summary).toBe("parent-teacher meeting");
    expect(p.interactions[1]?.kind).toBe("message");
    expect(() => recordInteraction(p, { kind: "call", summary: "  " })).toThrow(
      EmptyInteractionSummaryError,
    );
  });
});
