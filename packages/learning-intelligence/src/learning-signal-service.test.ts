import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { SIGNAL_CAPTURED } from "./learning-intelligence-events";
import { LearningSignalService } from "./learning-signal-service";
import {
  InvalidLearningSignalError,
  OrganizationNotFoundForInsightError,
  StudentNotFoundForInsightError,
} from "./errors";
import {
  InMemoryLearningSignalRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("LearningSignalService", () => {
  let repository: InMemoryLearningSignalRepository;
  let events: DomainEvent[];
  let service: LearningSignalService;

  beforeEach(() => {
    repository = new InMemoryLearningSignalRepository();
    events = [];
    service = new LearningSignalService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([STUDENT]) as StudentDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const capture = () =>
    service.capture({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      dimension: "attendance",
      source: "attendance_presence",
      metric: "attendance_rate",
      value: 62,
      trend: "declining",
      evidence: { kind: "presence_profile", ref: "pp-1" as Uuid },
    });

  it("rejects a signal for an unknown organization or student", async () => {
    await expect(
      service.capture({
        tenantId: TENANT,
        organizationId: "ghost" as Uuid,
        studentId: STUDENT,
        dimension: "academic",
        source: "assessment_evaluation",
        metric: "avg",
        value: 50,
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForInsightError);
    await expect(
      service.capture({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: "ghost" as Uuid,
        dimension: "academic",
        source: "assessment_evaluation",
        metric: "avg",
        value: 50,
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForInsightError);
  });

  it("captures an evidence-bearing signal, clamps the reading, and emits the event", async () => {
    const signal = await capture();
    expect(signal.value).toBe(62);
    expect(signal.dimension).toBe("attendance");
    expect(signal.evidence).toEqual({
      source: "attendance_presence",
      kind: "presence_profile",
      ref: "pp-1",
      detail: null,
    });
    expect(events.map((e) => e.type)).toEqual([SIGNAL_CAPTURED]);

    const listed = await service.listForStudent(TENANT, STUDENT);
    expect(listed).toHaveLength(1);
  });

  it("rejects a non-finite reading", async () => {
    await expect(
      service.capture({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        dimension: "academic",
        source: "assessment_evaluation",
        metric: "avg",
        value: Number.NaN,
      }),
    ).rejects.toBeInstanceOf(InvalidLearningSignalError);
  });
});
