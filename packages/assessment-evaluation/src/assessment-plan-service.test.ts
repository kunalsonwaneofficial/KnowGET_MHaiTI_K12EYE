import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { AssessmentPlanService } from "./assessment-plan-service";
import { AssessmentPlanStateError, SubjectNotFoundForAssessmentError } from "./errors";
import {
  InMemoryAssessmentPlanRepository,
  type OrganizationDirectory,
  type SubjectDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("AssessmentPlanService", () => {
  let repository: InMemoryAssessmentPlanRepository;
  let service: AssessmentPlanService;

  beforeEach(() => {
    repository = new InMemoryAssessmentPlanRepository();
    service = new AssessmentPlanService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      subjects: allow([SUBJECT]) as SubjectDirectory,
    });
  });

  const create = (overrides: Partial<Parameters<AssessmentPlanService["create"]>[0]> = {}) =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      planType: "annual",
      title: "Annual Assessment Plan",
      ...overrides,
    });

  it("creates a draft plan and publishes it", async () => {
    const plan = await create();
    expect(plan.status).toBe("draft");
    const published = await service.publish(TENANT, plan.id);
    expect(published.status).toBe("published");
  });

  it("rejects an unknown subject", async () => {
    await expect(create({ subjectId: "ghost" as Uuid })).rejects.toBeInstanceOf(
      SubjectNotFoundForAssessmentError,
    );
  });

  it("freezes an archived plan", async () => {
    const plan = await create();
    await service.archive(TENANT, plan.id);
    await expect(service.rename(TENANT, plan.id, "New")).rejects.toBeInstanceOf(
      AssessmentPlanStateError,
    );
  });
});
