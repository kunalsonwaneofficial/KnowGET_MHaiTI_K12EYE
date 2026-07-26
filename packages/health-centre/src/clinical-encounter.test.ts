import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  assignEncounterClinician,
  cancelEncounter,
  completeEncounter,
  isEncounterOpen,
  openEncounter,
  recordAssessment,
  setChiefComplaint,
  setTriageAcuity,
  startEncounter,
} from "./clinical-encounter";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const centreId = "33333333-3333-3333-3333-333333333333" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;
const clinicianId = "55555555-5555-5555-5555-555555555555" as Uuid;

const make = () =>
  openEncounter({
    tenantId,
    organizationId,
    centreId,
    patientId,
    triageAcuity: "routine",
    chiefComplaint: "  fever  ",
  });

describe("ClinicalEncounter aggregate", () => {
  it("opens draft, trimming the chief complaint", () => {
    const e = make();
    expect(e.status).toBe("draft");
    expect(e.chiefComplaint).toBe("fever");
    expect(e.assessment).toBeNull();
    expect(e.disposition).toBeNull();
    expect(isEncounterOpen(e)).toBe(true);
  });

  it("requires a clinician before it can start, then runs to completion with a disposition", () => {
    const e = make();
    expect(() => startEncounter(e)).toThrow(/needs an assigned clinician/);
    const assigned = assignEncounterClinician(e, clinicianId);
    const started = startEncounter(assigned);
    expect(started.status).toBe("in_progress");
    const assessed = recordAssessment(started, "  viral, rest advised ");
    expect(assessed.assessment).toBe("viral, rest advised");
    const done = completeEncounter(assessed, "discharged");
    expect(done.status).toBe("completed");
    expect(done.disposition).toBe("discharged");
    expect(isEncounterOpen(done)).toBe(false);
  });

  it("allows triage/complaint edits only while open and assessment only in progress", () => {
    const done = completeEncounter(
      startEncounter(assignEncounterClinician(make(), clinicianId)),
      "referred",
    );
    expect(() => setTriageAcuity(done, "urgent")).toThrow(/cannot move/);
    expect(() => setChiefComplaint(done, "x")).toThrow(/cannot move/);
    expect(() => recordAssessment(make(), "x")).toThrow(/cannot move/); // draft, not in_progress
  });

  it("cancels from draft or in progress, and guards double transitions", () => {
    expect(cancelEncounter(make()).status).toBe("cancelled");
    const started = startEncounter(assignEncounterClinician(make(), clinicianId));
    expect(cancelEncounter(started).status).toBe("cancelled");
    expect(() => startEncounter(started)).toThrow(/cannot move/); // already in_progress
    expect(() => completeEncounter(make(), "discharged")).toThrow(/cannot move/); // draft, not in_progress
  });
});
