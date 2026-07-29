import { beforeEach, describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AcademicRecord } from "./academic-record";
import type { GradeEntry } from "./academic-record-value";
import { InMemoryAcademicRecordRepository, InMemoryCompetencyProfileRepository } from "./ports";
import { ReportingService } from "./reporting-service";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;
const OTHER_STUDENT = "stu-2" as Uuid;
const SUBJECT = "subj-1" as Uuid;
const AT = "2026-01-01T00:00:00.000Z" as ISODateString;

const ENTRIES: readonly GradeEntry[] = [
  { subjectId: SUBJECT, marks: 90, maxMarks: 100, percentage: 90, grade: "A", gpa: 9, credits: 4 },
];

let seq = 0;

const publishedRecord = (
  academicYear: string,
  term: string,
  overrides: Partial<AcademicRecord> = {},
): AcademicRecord => {
  seq += 1;
  return {
    id: `rec-${seq}` as Uuid,
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    academicYear,
    term,
    gradeEntries: ENTRIES,
    gpa: 9,
    totalCredits: 4,
    promotionDecision: "promoted",
    status: "published",
    version: 1,
    amendments: [],
    publishedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
};

const pairs = (terms: readonly { academicYear: string; term: string }[]): string[] =>
  terms.map((t) => `${t.academicYear}/${t.term}`);

describe("ReportingService.generateTranscript", () => {
  let academicRecords: InMemoryAcademicRecordRepository;
  let competencyProfiles: InMemoryCompetencyProfileRepository;
  let service: ReportingService;

  beforeEach(() => {
    seq = 0;
    academicRecords = new InMemoryAcademicRecordRepository();
    competencyProfiles = new InMemoryCompetencyProfileRepository();
    service = new ReportingService({ academicRecords, competencyProfiles });
  });

  it("orders terms by academic year, then by term", async () => {
    for (const record of [
      publishedRecord("2024-25", "2"),
      publishedRecord("2023-24", "1"),
      publishedRecord("2024-25", "1"),
      publishedRecord("2023-24", "2"),
    ]) {
      await academicRecords.save(record);
    }

    const transcript = await service.generateTranscript(TENANT, STUDENT);

    expect(pairs(transcript.terms)).toEqual(["2023-24/1", "2023-24/2", "2024-25/1", "2024-25/2"]);
  });

  /**
   * `academicYear` and `term` are free text — the column is unconstrained and the aggregate only
   * requires non-empty — so ordering must not depend on a single concatenated key. Records whose
   * year and term run together into the same string ("2024"+"10" and "20241"+"0") must still be
   * ordered by year first. A U+0000 separator does not achieve this: `localeCompare` treats it as
   * collation-ignorable, so both keys collate equal and the sort falls back to insertion order.
   */
  it("orders records whose year and term concatenate identically", async () => {
    for (const record of [
      publishedRecord("20241", "0"),
      publishedRecord("2024", "10"),
      publishedRecord("2023", "1"),
    ]) {
      await academicRecords.save(record);
    }

    const transcript = await service.generateTranscript(TENANT, STUDENT);

    expect(pairs(transcript.terms)).toEqual(["2023/1", "2024/10", "20241/0"]);
  });

  it("excludes draft records and other learners' records from the transcript", async () => {
    await academicRecords.save(publishedRecord("2024-25", "1"));
    await academicRecords.save(publishedRecord("2024-25", "2", { status: "draft" }));
    await academicRecords.save(publishedRecord("2024-25", "3", { studentId: OTHER_STUDENT }));

    const transcript = await service.generateTranscript(TENANT, STUDENT);

    expect(pairs(transcript.terms)).toEqual(["2024-25/1"]);
    expect(transcript.totalCredits).toBe(4);
  });

  it("returns an empty transcript with no cumulative GPA when nothing is published", async () => {
    await academicRecords.save(publishedRecord("2024-25", "1", { status: "draft" }));

    const transcript = await service.generateTranscript(TENANT, STUDENT);

    expect(transcript.terms).toEqual([]);
    expect(transcript.cumulativeGpa).toBeNull();
    expect(transcript.totalCredits).toBe(0);
  });
});
