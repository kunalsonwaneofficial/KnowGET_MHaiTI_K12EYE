import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { RECOMMENDATION_ACCEPTED, RECOMMENDATION_PROPOSED } from "./learning-intelligence-events";
import { RecommendationService } from "./recommendation-service";
import { RecommendationStateError, StudentNotFoundForInsightError } from "./errors";
import {
  InMemoryRecommendationRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;
const TEACHER = "teacher-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("RecommendationService", () => {
  let repository: InMemoryRecommendationRepository;
  let events: DomainEvent[];
  let service: RecommendationService;

  beforeEach(() => {
    repository = new InMemoryRecommendationRepository();
    events = [];
    service = new RecommendationService({
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
      category: "instructional_support",
      action: "Small-group maths tutoring, twice weekly.",
      rationale: "Academic health at_risk with a declining trend.",
      priority: "high",
      targetDimension: "academic",
    });

  it("validates the student on propose", async () => {
    await expect(
      service.propose({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: "ghost" as Uuid,
        category: "monitoring",
        action: "a",
        rationale: "r",
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundForInsightError);
  });

  it("proposes, then a human accepts (recorded) and it is actioned", async () => {
    const rec = await propose();
    expect(rec.status).toBe("proposed");

    const accepted = await service.accept(TENANT, rec.id, TEACHER, "agreed at review");
    expect(accepted.status).toBe("accepted");
    expect(accepted.decidedBy).toBe(TEACHER);

    const actioned = await service.action(TENANT, rec.id, TEACHER);
    expect(actioned.status).toBe("actioned");
    expect(actioned.history.map((h) => h.action)).toEqual(["proposed", "accepted", "actioned"]);
    expect(events.map((e) => e.type)).toEqual([RECOMMENDATION_PROPOSED, RECOMMENDATION_ACCEPTED]);
  });

  it("cannot action a recommendation that was never accepted", async () => {
    const rec = await propose();
    await expect(service.action(TENANT, rec.id)).rejects.toBeInstanceOf(RecommendationStateError);
  });

  it("records the decider on rejection and freezes content", async () => {
    const rec = await propose();
    const rejected = await service.reject(TENANT, rec.id, TEACHER, "not appropriate now");
    expect(rejected.status).toBe("rejected");
    expect(rejected.decidedBy).toBe(TEACHER);
    await expect(service.revise(TENANT, rec.id, "x", "y")).rejects.toBeInstanceOf(
      RecommendationStateError,
    );
  });
});
