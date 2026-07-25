import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AcademicRecordService } from "./academic-record-service";
import type { GradeEntry } from "./academic-record-value";
import { ACADEMIC_RECORD_UPDATED, PROMOTION_RECOMMENDED } from "./assessment-evaluation-events";
import {
  AcademicRecordStateError,
  DuplicateAcademicRecordError,
  OrganizationNotFoundForAssessmentError,
  StudentNotFoundForAssessmentError,
} from "./errors";
import {
  InMemoryAcademicRecordRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;
const S1 = "subj-1" as Uuid;
const S2 = "subj-2" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

// Credit-weighted GPA: (9*4 + 8*2) / (4+2) = 52/6 = 8.67.
const ENTRIES: readonly GradeEntry[] = [
  { subjectId: S1, marks: 90, maxMarks: 100, percentage: 90, grade: "A", gpa: 9, credits: 4 },
  { subjectId: S2, marks: 80, maxMarks: 100, percentage: 80, grade: "B", gpa: 8, credits: 2 },
];

describe("AcademicRecordService", () => {
  let repository: InMemoryAcademicRecordRepository;
  let events: DomainEvent[];
  let service: AcademicRecordService;

  beforeEach(() => {
    repository = new InMemoryAcademicRecordRepository();
    events = [];
    service = new AcademicRecordService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([STUDENT]) as StudentDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const create = () =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      academicYear: "2026-27",
      term: "Term 1",
      gradeEntries: ENTRIES,
    });

  it("rejects an academic record for an unknown organization or student", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: "ghost" as Uuid,
        studentId: STUDENT,
        academicYear: "2026-27",
        term: "Term 1",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAssessmentError);
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: "ghost" as Uuid,
        academicYear: "2026-27",
        term: "Term 1",
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForAssessmentError);
  });

  it("enforces one record per (student, academic year, term)", async () => {
    await create();
    await expect(create()).rejects.toBeInstanceOf(DuplicateAcademicRecordError);
  });

  it("computes credit-weighted GPA and credits from grade entries", async () => {
    const record = await create();
    expect(record.gpa).toBe(8.67);
    expect(record.totalCredits).toBe(6);
    expect(record.status).toBe("draft");
  });

  it("recommends promotion when a non-pending decision is set on a draft", async () => {
    const record = await create();
    await service.setPromotionDecision(TENANT, record.id, "promoted");
    expect(events.map((e) => e.type)).toEqual([PROMOTION_RECOMMENDED]);
  });

  it("publishes to an immutable record, then only amends through the reasoned workflow", async () => {
    const record = await create();
    const published = await service.publish(TENANT, record.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
    expect(events.map((e) => e.type)).toEqual([ACADEMIC_RECORD_UPDATED]);

    // Draft-only operations are rejected once published.
    await expect(service.setGradeEntries(TENANT, record.id, ENTRIES)).rejects.toBeInstanceOf(
      AcademicRecordStateError,
    );

    // An amendment bumps the version, appends a reasoned entry and re-emits the update.
    const corrected: readonly GradeEntry[] = [
      { subjectId: S1, marks: 95, maxMarks: 100, percentage: 95, grade: "A", gpa: 10, credits: 4 },
      ENTRIES[1] as GradeEntry,
    ];
    const amended = await service.amendGradeEntries(
      TENANT,
      record.id,
      corrected,
      "re-totalled paper 1",
      "teacher-1" as Uuid,
    );
    expect(amended.version).toBe(2);
    expect(amended.gpa).toBe(9.33); // (10*4 + 8*2)/6
    expect(amended.amendments).toHaveLength(1);
    expect(amended.amendments[0]?.reason).toBe("re-totalled paper 1");

    const promoted = await service.amendPromotionDecision(
      TENANT,
      record.id,
      "promoted",
      "board approved",
    );
    expect(promoted.version).toBe(3);
    expect(events.map((e) => e.type)).toEqual([
      ACADEMIC_RECORD_UPDATED, // publish
      ACADEMIC_RECORD_UPDATED, // amend grades
      ACADEMIC_RECORD_UPDATED, // amend promotion
      PROMOTION_RECOMMENDED, // non-pending promotion
    ]);
  });

  it("rejects an amendment with no reason", async () => {
    const record = await create();
    await service.publish(TENANT, record.id);
    await expect(
      service.amendPromotionDecision(TENANT, record.id, "retained", "  "),
    ).rejects.toThrow();
  });
});
