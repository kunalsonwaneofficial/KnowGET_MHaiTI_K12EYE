import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  InvalidSubstitutionError,
  ScheduleSlotNotFoundError,
  SubstitutionStateError,
  TeacherNotFoundForSchedulingError,
} from "./errors";
import {
  InMemoryResourceRepository,
  InMemoryScheduleSlotRepository,
  InMemorySubstitutionRepository,
  type TeacherDirectory,
} from "./ports";
import { createScheduleSlot } from "./schedule-slot";
import { SubstitutionService } from "./substitution-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const TIMETABLE = "33333333-3333-3333-3333-333333333333" as Uuid;
const SECTION = "44444444-4444-4444-4444-444444444444" as Uuid;
const SUBJECT = "66666666-6666-6666-6666-666666666666" as Uuid;
const TEACHER_1 = "77777777-7777-7777-7777-777777777777" as Uuid;
const TEACHER_2 = "88888888-8888-8888-8888-888888888888" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const teachers: TeacherDirectory = {
  exists: async (_t, id) => id === TEACHER_1 || id === TEACHER_2,
};

async function harness() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const slotRepo = new InMemoryScheduleSlotRepository();
  const slot = createScheduleSlot({
    tenantId: TENANT,
    organizationId: ORG,
    timetableId: TIMETABLE,
    dayOfWeek: "monday",
    startsAt: "09:00",
    endsAt: "10:00",
    subjectId: SUBJECT,
    teacherId: TEACHER_1,
    sectionId: SECTION,
  });
  await slotRepo.save(slot);
  const substitutions = new SubstitutionService({
    repository: new InMemorySubstitutionRepository(),
    slots: slotRepo,
    teachers,
    resources: new InMemoryResourceRepository(),
    events: bus,
  });
  return { events, substitutions, slotId: slot.id };
}

describe("SubstitutionService", () => {
  it("assigns a teacher substitution, deriving org, and publishes substitution.assigned", async () => {
    const { events, substitutions, slotId } = await harness();
    const sub = await substitutions.assign({
      tenantId: TENANT,
      scheduleSlotId: slotId,
      substitutionType: "teacher",
      originalId: TEACHER_1,
      replacementId: TEACHER_2,
      reason: "sick leave",
    });
    expect(sub.status).toBe("assigned");
    expect(sub.organizationId).toBe(ORG);
    expect(events.map((e) => e.type)).toContain("scheduling.substitution.assigned");
  });

  it("rejects a missing slot, a self-substitution and an unknown replacement", async () => {
    const { substitutions, slotId } = await harness();
    await expect(
      substitutions.assign({
        tenantId: TENANT,
        scheduleSlotId: UNKNOWN,
        substitutionType: "teacher",
        originalId: TEACHER_1,
        replacementId: TEACHER_2,
      }),
    ).rejects.toBeInstanceOf(ScheduleSlotNotFoundError);
    await expect(
      substitutions.assign({
        tenantId: TENANT,
        scheduleSlotId: slotId,
        substitutionType: "teacher",
        originalId: TEACHER_1,
        replacementId: TEACHER_1,
      }),
    ).rejects.toBeInstanceOf(InvalidSubstitutionError);
    await expect(
      substitutions.assign({
        tenantId: TENANT,
        scheduleSlotId: slotId,
        substitutionType: "teacher",
        originalId: TEACHER_1,
        replacementId: UNKNOWN,
      }),
    ).rejects.toBeInstanceOf(TeacherNotFoundForSchedulingError);
  });

  it("completes an assigned substitution and rejects a second transition", async () => {
    const { substitutions, slotId } = await harness();
    const sub = await substitutions.assign({
      tenantId: TENANT,
      scheduleSlotId: slotId,
      substitutionType: "teacher",
      originalId: TEACHER_1,
      replacementId: TEACHER_2,
    });
    expect((await substitutions.complete(TENANT, sub.id)).status).toBe("completed");
    await expect(substitutions.cancel(TENANT, sub.id)).rejects.toBeInstanceOf(
      SubstitutionStateError,
    );
  });
});
