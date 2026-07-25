import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AcademicPlanService } from "./academic-plan-service";
import {
  AcademicPlanStateError,
  DuplicateAcademicPlanError,
  OrganizationNotFoundForTeachingError,
} from "./errors";
import { ACADEMIC_PLAN_PUBLISHED } from "./teaching-learning-events";
import { InMemoryAcademicPlanRepository, type OrganizationDirectory } from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;

const dir = (allowed: readonly string[]): OrganizationDirectory => ({
  exists: async (_t, id) => allowed.includes(id),
});

describe("AcademicPlanService", () => {
  let repository: InMemoryAcademicPlanRepository;
  let events: DomainEvent[];
  let service: AcademicPlanService;

  beforeEach(() => {
    repository = new InMemoryAcademicPlanRepository();
    events = [];
    service = new AcademicPlanService({
      repository,
      organizations: dir([ORG]),
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const create = () =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      planType: "annual",
      code: "AP-2026",
      title: "Annual Plan 2026",
    });

  it("rejects an academic plan for an unknown organization", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: "ghost" as Uuid,
        planType: "annual",
        code: "X",
        title: "X",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForTeachingError);
  });

  it("enforces one plan per (organization, code)", async () => {
    await create();
    await expect(create()).rejects.toBeInstanceOf(DuplicateAcademicPlanError);
  });

  it("publishes a draft plan and emits the event exactly once", async () => {
    const plan = await create();
    expect(plan.status).toBe("draft");
    const published = await service.publish(TENANT, plan.id);
    expect(published.status).toBe("published");
    expect(events.map((e) => e.type)).toEqual([ACADEMIC_PLAN_PUBLISHED]);
    // republishing a published plan is a state error
    await expect(service.publish(TENANT, plan.id)).rejects.toBeInstanceOf(AcademicPlanStateError);
  });

  it("refuses edits once archived", async () => {
    const plan = await create();
    await service.archive(TENANT, plan.id);
    await expect(service.rename(TENANT, plan.id, "New")).rejects.toBeInstanceOf(
      AcademicPlanStateError,
    );
  });
});
