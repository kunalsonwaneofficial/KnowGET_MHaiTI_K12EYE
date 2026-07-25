import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { amendSession, logSession } from "./coaching-session";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ENGAGEMENT = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = () =>
  logSession({
    tenantId: TENANT,
    organizationId: ORG,
    engagementId: ENGAGEMENT,
    sessionDate: "2026-03-15",
    focus: "  Wait time  ",
    notes: "Discussed pacing",
  });

describe("logSession", () => {
  it("logs a session, trimming text and defaulting optionals", () => {
    const s = make();
    expect(s.engagementId).toBe(ENGAGEMENT);
    expect(s.sessionDate).toBe("2026-03-15");
    expect(s.focus).toBe("Wait time");
    expect(s.notes).toBe("Discussed pacing");
    expect(s.nextSteps).toBeNull();
  });
});

describe("amendSession", () => {
  it("changes only the provided fields", () => {
    const s = make();
    const amended = amendSession(s, { nextSteps: "Try think-pair-share" });
    expect(amended.nextSteps).toBe("Try think-pair-share");
    expect(amended.focus).toBe("Wait time"); // unchanged
    expect(amendSession(s, { notes: null }).notes).toBeNull();
  });
});
