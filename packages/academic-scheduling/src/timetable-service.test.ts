import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateTimetableError,
  GradeNotFoundForSchedulingError,
  OrganizationNotFoundForSchedulingError,
  ScheduleConflictError,
  TimetableStateError,
} from "./errors";
import {
  InMemoryScheduleSlotRepository,
  InMemoryTimetableRepository,
  type ClassDirectory,
} from "./ports";
import { ScheduleSlotService } from "./schedule-slot-service";
import { TimetableService } from "./timetable-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRADE = "33333333-3333-3333-3333-333333333333" as Uuid;
const SECTION_A = "44444444-4444-4444-4444-444444444444" as Uuid;
const SECTION_B = "55555555-5555-5555-5555-555555555555" as Uuid;
const SUBJECT = "66666666-6666-6666-6666-666666666666" as Uuid;
const TEACHER = "77777777-7777-7777-7777-777777777777" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const yes: ClassDirectory = { exists: async () => true };
const only = (allowed: Uuid): ClassDirectory => ({ exists: async (_t, id) => id === allowed });

function harness() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const timetableRepo = new InMemoryTimetableRepository();
  const slotRepo = new InMemoryScheduleSlotRepository();
  const timetables = new TimetableService({
    repository: timetableRepo,
    slots: slotRepo,
    organizations: yes,
    grades: yes,
    classes: yes,
    sections: yes,
    events: bus,
  });
  const slots = new ScheduleSlotService({
    repository: slotRepo,
    timetables: timetableRepo,
    subjects: yes,
    teachers: yes,
    sections: yes,
    events: bus,
  });
  return { events, timetables, slots };
}

const createInput = (code = "TT-G5") => ({
  tenantId: TENANT,
  organizationId: ORG,
  code,
  name: "Grade 5 Timetable",
  academicYear: "2026-2027",
  gradeId: GRADE,
});

describe("TimetableService", () => {
  it("creates a draft timetable and publishes timetable.created", async () => {
    const { events, timetables } = harness();
    const tt = await timetables.create(createInput());
    expect(tt.status).toBe("draft");
    expect(tt.version).toBe(1);
    expect(events.map((e) => e.type)).toEqual(["scheduling.timetable.created"]);
  });

  it("rejects an unknown organization, grade and a duplicate code", async () => {
    const { timetables } = harness();
    const strict = new TimetableService({
      repository: new InMemoryTimetableRepository(),
      slots: new InMemoryScheduleSlotRepository(),
      organizations: only(ORG),
      grades: only(GRADE),
    });
    await expect(
      strict.create({ ...createInput(), organizationId: UNKNOWN }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForSchedulingError);
    await expect(strict.create({ ...createInput(), gradeId: UNKNOWN })).rejects.toBeInstanceOf(
      GradeNotFoundForSchedulingError,
    );
    await timetables.create(createInput());
    await expect(timetables.create(createInput())).rejects.toBeInstanceOf(DuplicateTimetableError);
  });

  it("publishes a conflict-free timetable", async () => {
    const { events, timetables, slots } = harness();
    const tt = await timetables.create(createInput());
    await slots.assign({
      tenantId: TENANT,
      timetableId: tt.id,
      dayOfWeek: "monday",
      startsAt: "09:00",
      endsAt: "10:00",
      subjectId: SUBJECT,
      teacherId: TEACHER,
      sectionId: SECTION_A,
    });
    await slots.assign({
      tenantId: TENANT,
      timetableId: tt.id,
      dayOfWeek: "monday",
      startsAt: "10:00",
      endsAt: "11:00",
      subjectId: SUBJECT,
      teacherId: TEACHER,
      sectionId: SECTION_A,
    });
    const published = await timetables.publish(TENANT, tt.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
    expect(events.map((e) => e.type)).toContain("scheduling.timetable.published");
  });

  it("refuses to publish a teacher double-booking, emitting conflict.detected", async () => {
    const { events, timetables, slots } = harness();
    const tt = await timetables.create(createInput());
    await slots.assign({
      tenantId: TENANT,
      timetableId: tt.id,
      dayOfWeek: "monday",
      startsAt: "09:00",
      endsAt: "10:00",
      subjectId: SUBJECT,
      teacherId: TEACHER,
      sectionId: SECTION_A,
    });
    await slots.assign({
      tenantId: TENANT,
      timetableId: tt.id,
      dayOfWeek: "monday",
      startsAt: "09:30",
      endsAt: "10:30",
      subjectId: SUBJECT,
      teacherId: TEACHER,
      sectionId: SECTION_B,
    });
    await expect(timetables.publish(TENANT, tt.id)).rejects.toBeInstanceOf(ScheduleConflictError);
    const conflictEvent = events.find((e) => e.type === "scheduling.conflict.detected");
    expect(conflictEvent).toBeDefined();
    expect((conflictEvent!.payload as { kinds: string[] }).kinds).toContain("teacher");
    expect((await timetables.getById(TENANT, tt.id)).status).toBe("draft");
  });

  it("validates a draft without publishing and reports conflicts", async () => {
    const { timetables, slots } = harness();
    const tt = await timetables.create(createInput());
    expect(await timetables.validate(TENANT, tt.id)).toEqual([]);
    await slots.assign({
      tenantId: TENANT,
      timetableId: tt.id,
      dayOfWeek: "tuesday",
      startsAt: "09:00",
      endsAt: "10:00",
      subjectId: SUBJECT,
      teacherId: TEACHER,
      sectionId: SECTION_A,
    });
    await slots.assign({
      tenantId: TENANT,
      timetableId: tt.id,
      dayOfWeek: "tuesday",
      startsAt: "09:30",
      endsAt: "10:30",
      subjectId: SUBJECT,
      teacherId: TEACHER,
      sectionId: SECTION_B,
    });
    expect(await timetables.validate(TENANT, tt.id)).toHaveLength(1);
  });

  it("refuses to re-publish an already-published timetable with a state error", async () => {
    const { events, timetables } = harness();
    const tt = await timetables.create(createInput());
    await timetables.publish(TENANT, tt.id);
    await expect(timetables.publish(TENANT, tt.id)).rejects.toBeInstanceOf(TimetableStateError);
    // the second attempt fails the state check before conflict detection — no spurious event
    expect(events.filter((e) => e.type === "scheduling.conflict.detected")).toHaveLength(0);
  });

  it("revises a published timetable back to draft at the next version", async () => {
    const { events, timetables } = harness();
    const tt = await timetables.create(createInput());
    await timetables.publish(TENANT, tt.id);
    const revised = await timetables.revise(TENANT, tt.id, "shift PE to Friday");
    expect(revised.status).toBe("draft");
    expect(revised.version).toBe(2);
    expect(revised.revisions).toHaveLength(1);
    expect(revised.publishedAt).toBeNull();
    expect(events.map((e) => e.type)).toContain("scheduling.timetable.revised");
  });
});
