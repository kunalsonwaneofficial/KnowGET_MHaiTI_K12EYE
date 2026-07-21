import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CounsellingCaseService } from "./counselling-case-service";
import {
  CounsellingCaseNotFoundError,
  PersonNotFoundForWellbeingError,
  StudentNotFoundForWellbeingError,
} from "./errors";
import {
  InMemoryCounsellingCaseRepository,
  type PersonDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const COUNSELLOR = "44444444-4444-4444-4444-444444444444" as Uuid;
const OTHER_COUNSELLOR = "55555555-5555-5555-5555-555555555555" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const students: StudentDirectory = {
  organizationOf: async (_t, id) => (id === STUDENT ? ORG : null),
};
const persons: PersonDirectory = {
  exists: async (_t, id) => id === COUNSELLOR || id === OTHER_COUNSELLOR,
};

function service(): { svc: CounsellingCaseService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new CounsellingCaseService({
    repository: new InMemoryCounsellingCaseRepository(),
    students,
    persons,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const open = (svc: CounsellingCaseService) =>
  svc.open({
    tenantId: TENANT,
    studentId: STUDENT,
    counsellorId: COUNSELLOR,
    presentingConcern: "exam anxiety",
  });

describe("CounsellingCaseService", () => {
  it("opens a case, deriving the organization and publishing the opened event", async () => {
    const { svc, events } = service();
    const k = await open(svc);
    expect(k.organizationId).toBe(ORG);
    expect(k.status).toBe("open");
    expect(events.map((e) => e.type)).toEqual(["wellbeing.counselling_case.opened"]);
    expect(await svc.listForStudent(TENANT, STUDENT)).toHaveLength(1);
    expect(await svc.listForCounsellor(TENANT, COUNSELLOR)).toHaveLength(1);
  });

  it("allows multiple cases per student over time", async () => {
    const { svc } = service();
    await open(svc);
    await open(svc);
    expect(await svc.listForStudent(TENANT, STUDENT)).toHaveLength(2);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(2);
  });

  it("rejects an unknown student or counsellor", async () => {
    const { svc } = service();
    await expect(
      svc.open({
        tenantId: TENANT,
        studentId: UNKNOWN,
        counsellorId: COUNSELLOR,
        presentingConcern: "x",
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForWellbeingError);
    await expect(
      svc.open({
        tenantId: TENANT,
        studentId: STUDENT,
        counsellorId: UNKNOWN,
        presentingConcern: "x",
      }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWellbeingError);
  });

  it("records sessions, referrals and goals, then closes publishing the closed event", async () => {
    const { svc, events } = service();
    const k = await open(svc);
    await svc.recordSession(TENANT, k.id, { note: "session one", recordedBy: COUNSELLOR });
    await svc.addReferral(TENANT, k.id, { referredTo: "psychologist", reason: "specialist" });
    const { goal } = await svc.setGoal(TENANT, k.id, "coping strategies");
    await svc.updateGoalStatus(TENANT, k.id, goal.id, "achieved");
    const closed = await svc.close(TENANT, k.id, "discharged");
    expect(closed.status).toBe("closed");
    expect(closed.sessions).toHaveLength(1);
    const closedEvent = events.at(-1);
    expect(closedEvent?.type).toBe("wellbeing.counselling_case.closed");
    expect((closedEvent?.payload as { sessionCount: number }).sessionCount).toBe(1);
  });

  it("validates the counsellor on reassignment and reports a missing case", async () => {
    const { svc } = service();
    const k = await open(svc);
    const reassigned = await svc.assignCounsellor(TENANT, k.id, OTHER_COUNSELLOR);
    expect(reassigned.counsellorId).toBe(OTHER_COUNSELLOR);
    await expect(svc.assignCounsellor(TENANT, k.id, UNKNOWN)).rejects.toBeInstanceOf(
      PersonNotFoundForWellbeingError,
    );
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(CounsellingCaseNotFoundError);
  });
});
