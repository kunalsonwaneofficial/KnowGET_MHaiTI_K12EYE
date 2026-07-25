import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { INSIGHT_PUBLISHED } from "./learning-intelligence-events";
import { EducationalInsightService } from "./educational-insight-service";
import { EducationalInsightStateError, OrganizationNotFoundForInsightError } from "./errors";
import {
  InMemoryEducationalInsightRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("EducationalInsightService", () => {
  let repository: InMemoryEducationalInsightRepository;
  let events: DomainEvent[];
  let service: EducationalInsightService;

  beforeEach(() => {
    repository = new InMemoryEducationalInsightRepository();
    events = [];
    service = new EducationalInsightService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([STUDENT]) as StudentDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const propose = () =>
    service.propose({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      category: "gap",
      dimension: "academic",
      title: "Maths fluency gap",
      narrative: "Three assessments below threshold with declining engagement.",
      priority: "high",
    });

  it("validates the organization on propose", async () => {
    await expect(
      service.propose({
        tenantId: TENANT,
        organizationId: "ghost" as Uuid,
        studentId: STUDENT,
        category: "gap",
        title: "t",
        narrative: "n",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForInsightError);
  });

  it("proposes, revises while proposed, publishes and archives", async () => {
    const insight = await propose();
    expect(insight.status).toBe("proposed");

    const revised = await service.revise(
      TENANT,
      insight.id,
      "Maths fluency gap (Term 1)",
      "Updated narrative with the latest evidence.",
    );
    expect(revised.title).toBe("Maths fluency gap (Term 1)");

    const published = await service.publish(TENANT, insight.id);
    expect(published.status).toBe("published");
    expect(events.map((e) => e.type)).toEqual([INSIGHT_PUBLISHED]);

    // content is frozen once published
    await expect(service.revise(TENANT, insight.id, "x", "y")).rejects.toBeInstanceOf(
      EducationalInsightStateError,
    );

    const archived = await service.archive(TENANT, insight.id, null, "superseded");
    expect(archived.status).toBe("archived");
  });
});
