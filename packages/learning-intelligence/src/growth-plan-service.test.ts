import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { GROWTH_PLAN_ACHIEVED, GROWTH_PLAN_ACTIVATED } from "./learning-intelligence-events";
import { GrowthPlanService } from "./growth-plan-service";
import { GrowthPlanStateError, InvalidGrowthPlanError } from "./errors";
import {
  InMemoryGrowthPlanRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("GrowthPlanService", () => {
  let repository: InMemoryGrowthPlanRepository;
  let events: DomainEvent[];
  let service: GrowthPlanService;

  beforeEach(() => {
    repository = new InMemoryGrowthPlanRepository();
    events = [];
    service = new GrowthPlanService({
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
      title: "Term 1 maths recovery",
      focusDimension: "academic",
      goals: [
        { description: "Reach 60% on the unit test", targetDimension: "academic" },
        { description: "Attend all tutoring sessions", targetDimension: "engagement" },
      ],
    });

  it("cannot activate a plan with no goals", async () => {
    const plan = await service.create({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      title: "Empty plan",
    });
    await expect(service.activate(TENANT, plan.id)).rejects.toBeInstanceOf(InvalidGrowthPlanError);
  });

  it("activates, records goal outcomes with derived progress, and achieves", async () => {
    const plan = await create();
    expect(plan.status).toBe("draft");
    expect(plan.progressPercent).toBe(0);

    const active = await service.activate(TENANT, plan.id);
    expect(active.status).toBe("active");
    expect(events.map((e) => e.type)).toEqual([GROWTH_PLAN_ACTIVATED]);

    const firstGoal = active.goals[0]!.id;
    const secondGoal = active.goals[1]!.id;

    const afterOne = await service.recordGoalOutcome(TENANT, plan.id, firstGoal, "met");
    expect(afterOne.progressPercent).toBe(50); // 1 of 2 met
    // the outcome is auditable in the append-only history
    expect(afterOne.history.map((h) => h.action)).toContain("goal_met");

    const afterTwo = await service.recordGoalOutcome(TENANT, plan.id, secondGoal, "met");
    expect(afterTwo.progressPercent).toBe(100);

    const achieved = await service.achieve(TENANT, plan.id);
    expect(achieved.status).toBe("achieved");
    expect(events.map((e) => e.type)).toEqual([GROWTH_PLAN_ACTIVATED, GROWTH_PLAN_ACHIEVED]);
  });

  it("cannot record a goal outcome before the plan is active", async () => {
    const plan = await create();
    await expect(
      service.recordGoalOutcome(TENANT, plan.id, plan.goals[0]!.id, "met"),
    ).rejects.toBeInstanceOf(GrowthPlanStateError);
  });
});
