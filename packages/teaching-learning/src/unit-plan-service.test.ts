import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  CurriculumNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
  UnitPlanArchivedError,
} from "./errors";
import { UNIT_PLAN_CREATED } from "./teaching-learning-events";
import {
  InMemoryUnitPlanRepository,
  type CurriculumDirectory,
  type OrganizationDirectory,
  type SubjectDirectory,
} from "./ports";
import { UnitPlanService } from "./unit-plan-service";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;
const CURRICULUM = "cur-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("UnitPlanService", () => {
  let repository: InMemoryUnitPlanRepository;
  let events: DomainEvent[];
  let service: UnitPlanService;

  beforeEach(() => {
    repository = new InMemoryUnitPlanRepository();
    events = [];
    service = new UnitPlanService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      subjects: allow([SUBJECT]) as SubjectDirectory,
      curricula: allow([CURRICULUM]) as CurriculumDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const create = (overrides: Partial<Parameters<UnitPlanService["create"]>[0]> = {}) =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      title: "Fractions",
      learningOutcomeIds: ["o1" as Uuid, "o2" as Uuid],
      estimatedInstructionalHours: 8,
      ...overrides,
    });

  it("creates a unit against a validated subject and emits the event", async () => {
    const unit = await create();
    expect(unit.status).toBe("draft");
    expect(unit.learningOutcomeIds).toEqual(["o1", "o2"]);
    expect(events.map((e) => e.type)).toEqual([UNIT_PLAN_CREATED]);
  });

  it("rejects an unknown subject", async () => {
    await expect(create({ subjectId: "ghost" as Uuid })).rejects.toBeInstanceOf(
      SubjectNotFoundForTeachingError,
    );
  });

  it("rejects an unknown curriculum framework when one is supplied", async () => {
    await expect(create({ curriculumFrameworkId: "ghost" as Uuid })).rejects.toBeInstanceOf(
      CurriculumNotFoundForTeachingError,
    );
  });

  it("runs the draft → active → archived lifecycle and freezes when archived", async () => {
    const unit = await create();
    const active = await service.activate(TENANT, unit.id);
    expect(active.status).toBe("active");
    await service.archive(TENANT, unit.id);
    await expect(service.setEstimatedHours(TENANT, unit.id, 12)).rejects.toBeInstanceOf(
      UnitPlanArchivedError,
    );
  });
});
