import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateScheduleSlotError,
  SubjectNotFoundForSchedulingError,
  TeacherNotFoundForSchedulingError,
  TimetableStateError,
} from "./errors";
import {
  InMemoryScheduleSlotRepository,
  InMemoryTimetableRepository,
  type SubjectDirectory,
} from "./ports";
import { ScheduleSlotService } from "./schedule-slot-service";
import { TimetableService } from "./timetable-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRADE = "33333333-3333-3333-3333-333333333333" as Uuid;
const SECTION = "44444444-4444-4444-4444-444444444444" as Uuid;
const SUBJECT = "66666666-6666-6666-6666-666666666666" as Uuid;
const TEACHER = "77777777-7777-7777-7777-777777777777" as Uuid;

const yes: SubjectDirectory = { exists: async () => true };
const no: SubjectDirectory = { exists: async () => false };

async function harness(subjects: SubjectDirectory = yes, teachers: SubjectDirectory = yes) {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const timetableRepo = new InMemoryTimetableRepository();
  const slotRepo = new InMemoryScheduleSlotRepository();
  const timetables = new TimetableService({
    repository: timetableRepo,
    slots: slotRepo,
    organizations: yes,
    grades: yes,
    events: bus,
  });
  const slots = new ScheduleSlotService({
    repository: slotRepo,
    timetables: timetableRepo,
    subjects,
    teachers,
    sections: yes,
    events: bus,
  });
  const tt = await timetables.create({
    tenantId: TENANT,
    organizationId: ORG,
    code: "TT-G5",
    name: "Grade 5",
    academicYear: "2026-2027",
    gradeId: GRADE,
  });
  return { events, timetables, slots, timetableId: tt.id };
}

const base = (timetableId: Uuid) => ({
  tenantId: TENANT,
  timetableId,
  dayOfWeek: "monday" as const,
  startsAt: "09:00",
  endsAt: "10:00",
  subjectId: SUBJECT,
  teacherId: TEACHER,
  sectionId: SECTION,
});

describe("ScheduleSlotService", () => {
  it("assigns a slot, derives its organization, and publishes slot.assigned", async () => {
    const { events, slots, timetableId } = await harness();
    const slot = await slots.assign(base(timetableId));
    expect(slot.organizationId).toBe(ORG);
    expect(slot.startsAt).toBe("09:00");
    expect(events.map((e) => e.type)).toContain("scheduling.slot.assigned");
  });

  it("rejects an unknown subject and teacher", async () => {
    const badSubject = await harness(no, yes);
    await expect(badSubject.slots.assign(base(badSubject.timetableId))).rejects.toBeInstanceOf(
      SubjectNotFoundForSchedulingError,
    );
    const badTeacher = await harness(yes, no);
    await expect(badTeacher.slots.assign(base(badTeacher.timetableId))).rejects.toBeInstanceOf(
      TeacherNotFoundForSchedulingError,
    );
  });

  it("rejects a duplicate placement (timetable, day, start, section)", async () => {
    const { slots, timetableId } = await harness();
    await slots.assign(base(timetableId));
    await expect(slots.assign(base(timetableId))).rejects.toBeInstanceOf(
      DuplicateScheduleSlotError,
    );
  });

  it("refuses to assign into a non-draft timetable", async () => {
    const { slots, timetables, timetableId } = await harness();
    await timetables.publish(TENANT, timetableId);
    await expect(slots.assign(base(timetableId))).rejects.toBeInstanceOf(TimetableStateError);
  });

  it("refuses to remove or reschedule a slot once its timetable is published", async () => {
    const { slots, timetables, timetableId } = await harness();
    const slot = await slots.assign(base(timetableId));
    await timetables.publish(TENANT, timetableId);
    await expect(slots.remove(TENANT, slot.id)).rejects.toBeInstanceOf(TimetableStateError);
    await expect(
      slots.reschedule(TENANT, slot.id, "tuesday", "09:00", "10:00"),
    ).rejects.toBeInstanceOf(TimetableStateError);
  });

  it("refuses to reschedule a slot onto an occupied placement", async () => {
    const { slots, timetableId } = await harness();
    await slots.assign(base(timetableId));
    const other = await slots.assign({ ...base(timetableId), startsAt: "10:00", endsAt: "11:00" });
    await expect(
      slots.reschedule(TENANT, other.id, "monday", "09:00", "10:00"),
    ).rejects.toBeInstanceOf(DuplicateScheduleSlotError);
  });

  it("reschedules and reassigns a slot", async () => {
    const { slots, timetableId } = await harness();
    const slot = await slots.assign(base(timetableId));
    const moved = await slots.reschedule(TENANT, slot.id, "wednesday", "11:00", "12:00");
    expect(moved.dayOfWeek).toBe("wednesday");
    expect(moved.startsAt).toBe("11:00");
    const reassigned = await slots.setVenue(
      TENANT,
      slot.id,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid,
    );
    expect(reassigned.venueId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });
});
