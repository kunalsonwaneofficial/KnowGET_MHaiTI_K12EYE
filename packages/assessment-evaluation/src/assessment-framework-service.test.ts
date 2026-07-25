import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { AssessmentFrameworkService } from "./assessment-framework-service";
import {
  AssessmentFrameworkArchivedError,
  DuplicateAssessmentFrameworkError,
  OrganizationNotFoundForAssessmentError,
} from "./errors";
import { InMemoryAssessmentFrameworkRepository, type OrganizationDirectory } from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;

const dir = (allowed: readonly string[]): OrganizationDirectory => ({
  exists: async (_t, id) => allowed.includes(id),
});

describe("AssessmentFrameworkService", () => {
  let repository: InMemoryAssessmentFrameworkRepository;
  let service: AssessmentFrameworkService;

  beforeEach(() => {
    repository = new InMemoryAssessmentFrameworkRepository();
    service = new AssessmentFrameworkService({ repository, organizations: dir([ORG]) });
  });

  const create = () =>
    service.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "CBE-2026",
      name: "Competency-Based Framework",
      assessmentModel: "cbe",
      gradeBands: [{ label: "A", minPercentage: 80, gpa: 9 }],
    });

  it("rejects a framework for an unknown organization", async () => {
    await expect(
      service.create({
        tenantId: TENANT,
        organizationId: "ghost" as Uuid,
        code: "X",
        name: "X",
        assessmentModel: "traditional",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAssessmentError);
  });

  it("enforces one framework per (organization, code)", async () => {
    await create();
    await expect(create()).rejects.toBeInstanceOf(DuplicateAssessmentFrameworkError);
  });

  it("activates then revises to a new version, staying active", async () => {
    const framework = await create();
    const active = await service.activate(TENANT, framework.id);
    expect(active.status).toBe("active");
    const revised = await service.revise(TENANT, framework.id, "add practical weightage");
    expect(revised.version).toBe(2);
    expect(revised.status).toBe("active");
    expect(revised.revisions).toHaveLength(1);
  });

  it("freezes an archived framework", async () => {
    const framework = await create();
    await service.archive(TENANT, framework.id);
    await expect(service.rename(TENANT, framework.id, "New")).rejects.toBeInstanceOf(
      AssessmentFrameworkArchivedError,
    );
  });
});
