import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  acceptEngagement,
  cancelEngagement,
  completeEngagement,
  isEngagementRunning,
  proposeEngagement,
  setEngagementFocus,
} from "./coaching-engagement";
import { EmptyFocusError, InvalidEngagementTransitionError, SelfCoachingError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const COACH = "33333333-3333-3333-3333-333333333333" as Uuid;
const COACHEE = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  proposeEngagement({
    tenantId: TENANT,
    organizationId: ORG,
    coachId: COACH,
    coacheeId: COACHEE,
    focus: "Questioning techniques",
    startDate: "2026-02-01",
  });

describe("proposeEngagement", () => {
  it("proposes an engagement", () => {
    const e = make();
    expect(e.status).toBe("proposed");
    expect(e.endDate).toBeNull();
  });

  it("rejects self-coaching and an empty focus", () => {
    expect(() =>
      proposeEngagement({
        tenantId: TENANT,
        organizationId: ORG,
        coachId: COACH,
        coacheeId: COACH,
        focus: "x",
      }),
    ).toThrow(SelfCoachingError);
    expect(() =>
      proposeEngagement({
        tenantId: TENANT,
        organizationId: ORG,
        coachId: COACH,
        coacheeId: COACHEE,
        focus: "  ",
      }),
    ).toThrow(EmptyFocusError);
  });
});

describe("engagement lifecycle", () => {
  it("accepts, sets focus, then completes with an end date", () => {
    let e = acceptEngagement(make());
    expect(isEngagementRunning(e)).toBe(true);
    e = setEngagementFocus(e, "Formative assessment");
    expect(e.focus).toBe("Formative assessment");
    const completed = completeEngagement(e, "2026-06-30");
    expect(completed.status).toBe("completed");
    expect(completed.endDate).toBe("2026-06-30");
  });

  it("cancels from proposed or active", () => {
    expect(cancelEngagement(make()).status).toBe("cancelled");
    expect(cancelEngagement(acceptEngagement(make())).status).toBe("cancelled");
  });

  it("forbids illegal transitions and editing a terminal engagement", () => {
    const proposed = make();
    expect(() => completeEngagement(proposed)).toThrow(InvalidEngagementTransitionError);
    const cancelled = cancelEngagement(proposed);
    expect(() => acceptEngagement(cancelled)).toThrow(InvalidEngagementTransitionError);
    expect(() => setEngagementFocus(cancelled, "x")).toThrow(InvalidEngagementTransitionError);
  });
});
