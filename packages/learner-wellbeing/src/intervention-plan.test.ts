import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyInterventionEntryError,
  InterventionNotFoundError,
  InterventionNotOpenError,
} from "./errors";
import {
  assignIntervention,
  cancelIntervention,
  completeIntervention,
  createInterventionPlan,
  recordInterventionProgress,
  setEarlyWarningTriggers,
  startIntervention,
} from "./intervention-plan";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const STAFF = "44444444-4444-4444-4444-444444444444" as Uuid;

const plan = () =>
  createInterventionPlan({ tenantId: TENANT, organizationId: ORG, studentId: STUDENT });

describe("intervention plan aggregate", () => {
  it("creates an empty plan bound to the student and organization", () => {
    const p = plan();
    expect(p.organizationId).toBe(ORG);
    expect(p.earlyWarningTriggers).toEqual([]);
    expect(p.interventions).toEqual([]);
  });

  it("normalizes early-warning triggers", () => {
    const p = setEarlyWarningTriggers(plan(), [" attendance < 85% ", "attendance < 85%", "  "]);
    expect(p.earlyWarningTriggers).toEqual(["attendance < 85%"]);
  });

  it("assigns an intervention and drives it through progress to completion", () => {
    const { plan: p0, intervention } = assignIntervention(plan(), {
      description: " weekly mentoring ",
      responsibleStaff: STAFF,
    });
    expect(intervention.description).toBe("weekly mentoring");
    expect(intervention.status).toBe("assigned");
    const started = startIntervention(p0, intervention.id);
    expect(started.interventions[0]?.status).toBe("in_progress");
    const { plan: p1, note } = recordInterventionProgress(started, intervention.id, {
      note: "engaging well",
      recordedBy: STAFF,
    });
    expect(note.note).toBe("engaging well");
    const { plan: p2, intervention: done } = completeIntervention(
      p1,
      intervention.id,
      " goals met ",
    );
    expect(done.status).toBe("completed");
    expect(done.outcome).toBe("goals met");
    expect(p2.interventions[0]?.completedAt).not.toBeNull();
  });

  it("cancels an intervention and refuses further changes once closed", () => {
    const { plan: p0, intervention } = assignIntervention(plan(), {
      description: "check-ins",
      responsibleStaff: STAFF,
    });
    const cancelled = cancelIntervention(p0, intervention.id);
    expect(cancelled.interventions[0]?.status).toBe("cancelled");
    expect(() => startIntervention(cancelled, intervention.id)).toThrow(InterventionNotOpenError);
    expect(() => completeIntervention(cancelled, intervention.id, "x")).toThrow(
      InterventionNotOpenError,
    );
  });

  it("rejects blanks and unknown interventions", () => {
    const { plan: p0, intervention } = assignIntervention(plan(), {
      description: "x",
      responsibleStaff: STAFF,
    });
    expect(() => assignIntervention(plan(), { description: " ", responsibleStaff: STAFF })).toThrow(
      EmptyInterventionEntryError,
    );
    expect(() =>
      recordInterventionProgress(p0, intervention.id, { note: "  ", recordedBy: STAFF }),
    ).toThrow(EmptyInterventionEntryError);
    expect(() => completeIntervention(p0, intervention.id, "  ")).toThrow(
      EmptyInterventionEntryError,
    );
    expect(() => startIntervention(plan(), intervention.id)).toThrow(InterventionNotFoundError);
  });
});
