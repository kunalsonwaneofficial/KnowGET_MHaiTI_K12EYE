import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AdmissionEvaluationService } from "./admission-evaluation-service";
import { createApplication, startApplicationReview } from "./application";
import { InMemoryAdmissionEvaluationRepository, InMemoryApplicationRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const cycleId = "44444444-4444-4444-4444-444444444444" as Uuid;
const applicantPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const buildApplication = (underReview: boolean) => {
  const a = createApplication({
    tenantId,
    organizationId,
    cycleId,
    applicantPersonId,
    code: "APP-1",
    gradeApplyingFor: "G1",
    submittedOn: "2026-11-01",
  });
  return underReview ? startApplicationReview(a) : a;
};

const setup = async (underReview = true) => {
  const repository = new InMemoryAdmissionEvaluationRepository();
  const applications = new InMemoryApplicationRepository();
  const events: DomainEvent[] = [];
  const application = buildApplication(underReview);
  await applications.save(application);
  const service = new AdmissionEvaluationService({
    repository,
    applications,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, applications, service, application, events };
};

describe("AdmissionEvaluationService", () => {
  it("records an evaluation for an application under review and counts it", async () => {
    const { service, application, events } = await setup();
    const e = await service.record({
      tenantId,
      applicationId: application.id,
      type: "interview",
      score: 78,
      recommendation: "recommend",
      evaluatedOn: "2026-11-20",
    });
    expect(e.organizationId).toBe(organizationId);
    expect(events.map((ev) => ev.type)).toContain("admissions.evaluation.recorded");
    expect(await service.countForApplication(tenantId, application.id)).toBe(1);
  });

  it("rejects an evaluation for a submitted (not-yet-under-review) application", async () => {
    const { service, application } = await setup(false);
    await expect(
      service.record({
        tenantId,
        applicationId: application.id,
        type: "entrance_test",
        score: 50,
        recommendation: "hold",
        evaluatedOn: "d",
      }),
    ).rejects.toThrow(/not under review/);
  });
});
