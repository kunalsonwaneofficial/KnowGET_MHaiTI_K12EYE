import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  addReferral,
  assignCounsellor,
  closeCounsellingCase,
  openCounsellingCase,
  recordSession,
  setCasePriority,
  setCounsellingGoal,
  updateCounsellingGoalStatus,
} from "./counselling-case";
import {
  CounsellingCaseClosedError,
  CounsellingGoalNotFoundError,
  EmptyCounsellingEntryError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const COUNSELLOR = "44444444-4444-4444-4444-444444444444" as Uuid;
const OTHER = "55555555-5555-5555-5555-555555555555" as Uuid;

const openCase = () =>
  openCounsellingCase({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    counsellorId: COUNSELLOR,
    presentingConcern: " exam anxiety ",
  });

describe("counselling case aggregate", () => {
  it("opens a case with normalized concern, default priority and open status", () => {
    const k = openCase();
    expect(k.presentingConcern).toBe("exam anxiety");
    expect(k.priority).toBe("normal");
    expect(k.status).toBe("open");
    expect(k.outcome).toBeNull();
    expect(k.closedAt).toBeNull();
    expect(() => openCounsellingCase({ ...openCase(), presentingConcern: "  " })).toThrow(
      EmptyCounsellingEntryError,
    );
  });

  it("records confidential sessions and referrals as an append-only history", () => {
    const { kase: k0, session } = recordSession(openCase(), {
      note: " first session ",
      recordedBy: COUNSELLOR,
      occurredOn: "2026-04-01",
    });
    expect(session.note).toBe("first session");
    expect(session.occurredOn).toBe("2026-04-01");
    const { kase: k1, referral } = addReferral(k0, {
      referredTo: "external psychologist",
      reason: "specialist support",
    });
    expect(k1.sessions).toHaveLength(1);
    expect(referral.referredTo).toBe("external psychologist");
    expect(k1.referrals).toHaveLength(1);
  });

  it("reassigns counsellor and adjusts priority while open", () => {
    const reassigned = assignCounsellor(openCase(), OTHER);
    expect(reassigned.counsellorId).toBe(OTHER);
    expect(setCasePriority(reassigned, "urgent").priority).toBe("urgent");
  });

  it("manages goals and closes with an outcome", () => {
    const { kase: k0, goal } = setCounsellingGoal(openCase(), "build coping strategies");
    expect(goal.status).toBe("active");
    const achieved = updateCounsellingGoalStatus(k0, goal.id, "achieved");
    expect(achieved.goals[0]?.status).toBe("achieved");
    const closed = closeCounsellingCase(achieved, " improved; discharged ");
    expect(closed.status).toBe("closed");
    expect(closed.outcome).toBe("improved; discharged");
    expect(closed.closedAt).not.toBeNull();
    expect(() => updateCounsellingGoalStatus(k0, OTHER, "achieved")).toThrow(
      CounsellingGoalNotFoundError,
    );
  });

  it("refuses to mutate or re-close a closed case", () => {
    const closed = closeCounsellingCase(openCase(), "resolved");
    expect(() => recordSession(closed, { note: "x", recordedBy: COUNSELLOR })).toThrow(
      CounsellingCaseClosedError,
    );
    expect(() => addReferral(closed, { referredTo: "x", reason: "y" })).toThrow(
      CounsellingCaseClosedError,
    );
    expect(() => closeCounsellingCase(closed, "again")).toThrow(CounsellingCaseClosedError);
    expect(() => closeCounsellingCase(openCase(), "  ")).toThrow(EmptyCounsellingEntryError);
  });
});
