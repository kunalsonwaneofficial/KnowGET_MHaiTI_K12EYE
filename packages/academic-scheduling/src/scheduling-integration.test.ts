import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AllocationService } from "./allocation-service";
import { ScheduleConflictError } from "./errors";
import {
  InMemoryAllocationRepository,
  InMemoryResourceRepository,
  InMemoryScheduleSlotRepository,
  InMemorySchedulingPolicyRepository,
  InMemoryTimetableRepository,
  type OrganizationDirectory,
} from "./ports";
import { ResourceService } from "./resource-service";
import { ScheduleSlotService } from "./schedule-slot-service";
import { SchedulingPolicyService } from "./scheduling-policy-service";
import { TimetableService } from "./timetable-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRADE = "33333333-3333-3333-3333-333333333333" as Uuid;
const SECTION_A = "44444444-4444-4444-4444-444444444444" as Uuid;
const SECTION_B = "55555555-5555-5555-5555-555555555555" as Uuid;
const SUBJECT = "66666666-6666-6666-6666-666666666666" as Uuid;
const TEACHER = "77777777-7777-7777-7777-777777777777" as Uuid;

const yes: OrganizationDirectory = { exists: async () => true };

function platform() {
  const events: DomainEvent[] = [];
  const bus = { publish: async (e: DomainEvent) => void events.push(e) };
  const timetableRepo = new InMemoryTimetableRepository();
  const slotRepo = new InMemoryScheduleSlotRepository();
  const resourceRepo = new InMemoryResourceRepository();
  const allocationRepo = new InMemoryAllocationRepository();
  const policyRepo = new InMemorySchedulingPolicyRepository();

  const timetables = new TimetableService({
    repository: timetableRepo,
    slots: slotRepo,
    organizations: yes,
    grades: yes,
    classes: yes,
    sections: yes,
    allocations: allocationRepo, // structurally an AllocationConflictSource
    policies: policyRepo, // structurally a SchedulingConstraintSource
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
  const resources = new ResourceService({ repository: resourceRepo, organizations: yes });
  const allocations = new AllocationService({
    repository: allocationRepo,
    organizations: yes,
    resources: resourceRepo,
    teachers: yes,
    events: bus,
  });
  const policies = new SchedulingPolicyService({ repository: policyRepo, organizations: yes });
  return { events, timetables, slots, resources, allocations, policies };
}

const newTimetable = (timetables: TimetableService, code: string) =>
  timetables.create({
    tenantId: TENANT,
    organizationId: ORG,
    code,
    name: code,
    academicYear: "2026-2027",
    gradeId: GRADE,
  });

const slotAt = (
  slots: ScheduleSlotService,
  timetableId: Uuid,
  startsAt: string,
  endsAt: string,
  sectionId: Uuid = SECTION_A,
) =>
  slots.assign({
    tenantId: TENANT,
    timetableId,
    dayOfWeek: "monday",
    startsAt,
    endsAt,
    subjectId: SUBJECT,
    teacherId: TEACHER,
    sectionId,
  });

describe("scheduling integration — full conflict picture", () => {
  it("publishes a valid schedule with allocations and an active policy", async () => {
    const { timetables, slots, resources, allocations, policies } = platform();
    const tt = await newTimetable(timetables, "TT-1");
    await slotAt(slots, tt.id, "09:00", "10:00");
    await slotAt(slots, tt.id, "10:00", "11:00");
    const room = await resources.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "R-101",
      name: "Room 101",
      kind: "classroom",
      capacity: 40,
    });
    await allocations.allocate({
      tenantId: TENANT,
      organizationId: ORG,
      resourceKind: "classroom",
      resourceId: room.id,
      dayOfWeek: "monday",
      startsAt: "09:00",
      endsAt: "10:00",
      occupancy: 30,
    });
    const policy = await policies.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "MAX-6",
      name: "Max 6 periods/day",
      ruleType: "max_teaching_periods",
      parameters: { maxPeriodsPerDay: 6 },
    });
    await policies.activate(TENANT, policy.id);
    const published = await timetables.publish(TENANT, tt.id);
    expect(published.status).toBe("published");
  });

  it("refuses to publish when two allocations of one resource overlap", async () => {
    const { timetables, slots, resources, allocations } = platform();
    const tt = await newTimetable(timetables, "TT-1");
    await slotAt(slots, tt.id, "09:00", "10:00");
    const lab = await resources.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "LAB-1",
      name: "Lab 1",
      kind: "laboratory",
    });
    const window = {
      tenantId: TENANT,
      organizationId: ORG,
      resourceKind: "laboratory" as const,
      resourceId: lab.id,
      dayOfWeek: "monday" as const,
    };
    await allocations.allocate({ ...window, startsAt: "09:00", endsAt: "10:00" });
    await allocations.allocate({ ...window, startsAt: "09:30", endsAt: "10:30" });
    await expect(timetables.publish(TENANT, tt.id)).rejects.toBeInstanceOf(ScheduleConflictError);
    const conflicts = await timetables.validate(TENANT, tt.id);
    expect(conflicts.some((c) => c.kind === "resource")).toBe(true);
  });

  it("refuses to publish when an active policy is violated", async () => {
    const { timetables, slots, policies } = platform();
    const tt = await newTimetable(timetables, "TT-1");
    await slotAt(slots, tt.id, "09:00", "10:00");
    await slotAt(slots, tt.id, "10:00", "11:00");
    await slotAt(slots, tt.id, "11:00", "12:00");
    const policy = await policies.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "MAX-2",
      name: "Max 2 periods/day",
      ruleType: "max_teaching_periods",
      parameters: { maxPeriodsPerDay: 2 },
    });
    await policies.activate(TENANT, policy.id);
    await expect(timetables.publish(TENANT, tt.id)).rejects.toBeInstanceOf(ScheduleConflictError);
    const conflicts = await timetables.validate(TENANT, tt.id);
    expect(conflicts.some((c) => c.kind === "policy")).toBe(true);
  });

  it("detects a teacher double-booking across two published timetables", async () => {
    const { timetables, slots } = platform();
    const first = await newTimetable(timetables, "TT-A");
    await slotAt(slots, first.id, "09:00", "10:00", SECTION_A);
    await timetables.publish(TENANT, first.id);

    const second = await newTimetable(timetables, "TT-B");
    await slotAt(slots, second.id, "09:30", "10:30", SECTION_B);
    await expect(timetables.publish(TENANT, second.id)).rejects.toBeInstanceOf(
      ScheduleConflictError,
    );
    const conflicts = await timetables.validate(TENANT, second.id);
    expect(conflicts.some((c) => c.kind === "teacher")).toBe(true);
  });

  it("computes scheduling intelligence and teacher workload over the published scope", async () => {
    const { timetables, slots } = platform();
    const tt = await newTimetable(timetables, "TT-1");
    await slotAt(slots, tt.id, "09:00", "10:00");
    await slotAt(slots, tt.id, "10:00", "11:00");
    const intel = await timetables.intelligence(TENANT, tt.id);
    expect(intel.slotCount).toBe(2);
    expect(intel.conflictCount).toBe(0);
    expect(intel.distinctTeachers).toBe(1);
    const workload = await timetables.teacherWorkload(TENANT, tt.id, TEACHER);
    expect(workload.totalPeriods).toBe(2);
    expect(workload.totalMinutes).toBe(120);
    expect(workload.busiestDay).toBe("monday");
  });
});
