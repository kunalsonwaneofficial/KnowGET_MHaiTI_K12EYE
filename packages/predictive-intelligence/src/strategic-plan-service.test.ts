import { beforeEach, describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  ActivePlanObjectivesFrozenError,
  AnonymousPlanReviewError,
  DuplicatePlanKeyError,
  OrganizationNotFoundForForecastError,
  PersonNotFoundForForecastError,
  PlanNotActiveError,
  PlanWithoutObjectivesError,
  StrategicPlanNotFoundError,
} from "./errors";
import { InMemoryStrategicPlanRepository } from "./ports";
import type { ObjectiveInput, StrategicPlan, StrategicPlanParams } from "./strategic-plan";
import { StrategicPlanService } from "./strategic-plan-service";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const OTHER_ORG = "44444444-4444-4444-8444-444444444444" as Uuid;
const UNKNOWN_ORG = "77777777-7777-4777-8777-777777777777" as Uuid;
const LEADER = "55555555-5555-4555-8555-555555555555" as Uuid;
const STRANGER = "66666666-6666-4666-8666-666666666666" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

/** Ninety to ninety-six over twelve periods, so the straight line through it is arithmetic anyone can check. */
const LIFT: ObjectiveInput = {
  objectiveKey: "attendance.rate",
  metricKey: "attendance.rate",
  direction: "higher_is_better",
  baselineValue: 90,
  targetValue: 96,
  targetPeriod: 12,
};

describe("StrategicPlanService", () => {
  let repository: InMemoryStrategicPlanRepository;
  let organizations: Set<string>;
  let people: Set<string>;
  let publishedEvents: DomainEvent[];
  let svc: StrategicPlanService;

  beforeEach(() => {
    repository = new InMemoryStrategicPlanRepository();
    organizations = new Set<string>([ORG, OTHER_ORG]);
    people = new Set<string>([LEADER]);
    publishedEvents = [];
    svc = new StrategicPlanService({
      repository,
      organizations: {
        async exists(_tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
          return organizations.has(organizationId);
        },
      },
      people: {
        async exists(_tenantId: TenantId, personId: Uuid): Promise<boolean> {
          return people.has(personId);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          publishedEvents.push(event);
        },
      },
    });
  });

  const types = (): readonly string[] => publishedEvents.map((event) => event.type);

  const params = (patch: Partial<StrategicPlanParams> = {}): StrategicPlanParams => ({
    tenantId: T1,
    organizationId: ORG,
    planKey: "attendance.lift",
    name: "Lift attendance",
    startPeriod: 0,
    objectives: [LIFT],
    ...patch,
  });

  /** A drafted plan with the announcement already drained. */
  const drafted = async (patch: Partial<StrategicPlanParams> = {}): Promise<StrategicPlan> => {
    const plan = await svc.draft(params(patch));
    publishedEvents.length = 0;
    return plan;
  };

  /** A plan the institution is operating under, with everything it announced on the way drained. */
  const active = async (patch: Partial<StrategicPlanParams> = {}): Promise<StrategicPlan> => {
    const plan = await svc.activate(T1, (await drafted(patch)).id, LEADER);
    publishedEvents.length = 0;
    return plan;
  };

  // --- Authoring -------------------------------------------------------------------

  describe("draft and amend", () => {
    it("saves an editable plan and announces it", async () => {
      const plan = await svc.draft(params());

      expect(plan.status).toBe("draft");
      expect(plan.objectives).toHaveLength(1);
      expect(plan.reviews).toEqual([]);
      expect(await repository.findById(T1, plan.id)).toEqual(plan);
      expect(types()).toEqual(["forecast.plan.drafted"]);
    });

    it("refuses an organization that does not exist, writing nothing", async () => {
      await expect(svc.draft(params({ organizationId: UNKNOWN_ORG }))).rejects.toThrow(
        OrganizationNotFoundForForecastError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(publishedEvents).toEqual([]);
    });

    it("sees through spelling to refuse a key the organization already has", async () => {
      await drafted();

      // The clash is judged on the key the aggregate normalized, not on the string that was sent.
      await expect(svc.draft(params({ planKey: "  Attendance.Lift  " }))).rejects.toThrow(
        DuplicatePlanKeyError,
      );

      expect(await repository.listByTenant(T1)).toHaveLength(1);
      expect(publishedEvents).toEqual([]);
    });

    it("permits the same key in another organization and in another tenant", async () => {
      await drafted();

      const elsewhere = await svc.draft(params({ organizationId: OTHER_ORG }));
      const theirs = await svc.draft(params({ tenantId: T2 }));

      expect(elsewhere.planKey).toBe("attendance.lift");
      expect(await repository.listByTenant(T1)).toHaveLength(2);
      expect(await repository.listByTenant(T2)).toEqual([theirs]);
    });

    it("restates what a plan says about itself", async () => {
      const plan = await drafted();

      const next = await svc.amend(T1, plan.id, { name: "Lift attendance, as tabled" });

      expect(next.name).toBe("Lift attendance, as tabled");
      expect(types()).toEqual(["forecast.plan.amended"]);
    });

    it("404s on a plan that is not there", async () => {
      await expect(svc.amend(T1, MISSING, { name: "Nothing" })).rejects.toThrow(
        StrategicPlanNotFoundError,
      );
    });
  });

  // --- Objectives ------------------------------------------------------------------

  describe("objectives", () => {
    it("adds, restates and removes objectives while the plan is still a draft", async () => {
      const plan = await drafted({ objectives: [] });

      const withObjectives = await svc.addObjectives(T1, plan.id, [
        LIFT,
        { ...LIFT, objectiveKey: "punctuality.rate", metricKey: "punctuality.rate" },
      ]);
      expect(withObjectives.objectives).toHaveLength(2);

      const amended = await svc.amendObjective(T1, plan.id, "attendance.rate", {
        targetValue: 97,
      });
      expect(
        amended.objectives.find((o) => o.objectiveKey === "attendance.rate")?.targetValue,
      ).toBe(97);

      const trimmed = await svc.removeObjective(T1, plan.id, "punctuality.rate");
      expect(trimmed.objectives).toHaveLength(1);

      expect(types()).toEqual([
        "forecast.plan.objectives_changed",
        "forecast.plan.objectives_changed",
        "forecast.plan.objectives_changed",
      ]);
    });

    it("refuses to move what an active plan is being measured against", async () => {
      const plan = await active();

      await expect(svc.addObjectives(T1, plan.id, [LIFT])).rejects.toThrow(
        ActivePlanObjectivesFrozenError,
      );
      expect(publishedEvents).toEqual([]);
    });
  });

  // --- Lifecycle -------------------------------------------------------------------

  describe("activate, complete and abandon", () => {
    it("commits to the plan on a named signature", async () => {
      const plan = await drafted();

      const next = await svc.activate(T1, plan.id, LEADER);

      expect(next.status).toBe("active");
      expect(next.activatedByUserId).toBe(LEADER);
      expect(await svc.listActive(T1)).toEqual([next]);
      expect(types()).toEqual(["forecast.plan.activated"]);
    });

    it("refuses to commit to a plan that commits to nothing", async () => {
      const plan = await drafted({ objectives: [] });

      await expect(svc.activate(T1, plan.id, LEADER)).rejects.toThrow(PlanWithoutObjectivesError);
      expect((await repository.findById(T1, plan.id))?.status).toBe("draft");
    });

    it("refuses to commit to a plan nobody signed", async () => {
      const plan = await drafted();

      await expect(svc.activate(T1, plan.id, null)).rejects.toThrow(AnonymousPlanReviewError);
      expect(publishedEvents).toEqual([]);
    });

    it("refuses a signatory who is not a person, writing nothing", async () => {
      const plan = await drafted();

      await expect(svc.activate(T1, plan.id, STRANGER)).rejects.toThrow(
        PersonNotFoundForForecastError,
      );
      expect((await repository.findById(T1, plan.id))?.status).toBe("draft");
    });

    it("closes a plan that ran its course", async () => {
      const plan = await active();

      const next = await svc.complete(T1, plan.id, LEADER);

      expect(next.status).toBe("completed");
      expect(next.closedByUserId).toBe(LEADER);
      expect(types()).toEqual(["forecast.plan.completed"]);
    });

    it("keeps a course the institution changed, with the reason it gave", async () => {
      const plan = await drafted();

      const next = await svc.abandon(T1, plan.id, LEADER, "  Superseded by the merger  ");

      // Abandonment is available from draft as well: a proposal nobody adopted is an outcome too, and
      // deleting it would turn a decision the institution took into a gap in its own record.
      expect(next.status).toBe("abandoned");
      expect(next.abandonmentReason).toBe("Superseded by the merger");
      expect(await repository.findById(T1, plan.id)).toEqual(next);
      expect(types()).toEqual(["forecast.plan.abandoned"]);
    });
  });

  // --- Measurement -----------------------------------------------------------------

  describe("progress and review", () => {
    it("records what actually happened against an active plan", async () => {
      const plan = await active();

      const next = await svc.recordProgress(T1, plan.id, [
        { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
      ]);

      expect(next.progress).toHaveLength(1);
      expect(types()).toEqual(["forecast.plan.progress_recorded"]);
    });

    it("refuses readings against a plan nobody is travelling", async () => {
      const plan = await drafted();

      await expect(
        svc.recordProgress(T1, plan.id, [
          { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
        ]),
      ).rejects.toThrow(PlanNotActiveError);
      expect(publishedEvents).toEqual([]);
    });

    it("announces a review carrying the reading it took, not the plan's current one", async () => {
      const plan = await active();
      await svc.recordProgress(T1, plan.id, [
        { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
      ]);
      publishedEvents.length = 0;

      const next = await svc.review(T1, plan.id, { period: 6, reviewedByUserId: LEADER });

      expect(next.reviews).toHaveLength(1);
      expect(types()).toEqual(["forecast.plan.reviewed"]);
      expect(publishedEvents.at(-1)?.payload).toMatchObject({
        period: 6,
        planVersion: 1,
        state: "on_track",
        onTrackCount: 1,
      });
    });

    it("leaves an earlier review saying what it saw when the figures move under it", async () => {
      const plan = await active();
      await svc.recordProgress(T1, plan.id, [
        { objectiveKey: "attendance.rate", period: 6, actualValue: 93 },
      ]);
      await svc.review(T1, plan.id, { period: 6, reviewedByUserId: LEADER });

      await svc.recordProgress(T1, plan.id, [
        { objectiveKey: "attendance.rate", period: 9, actualValue: 90 },
      ]);
      const next = await svc.review(T1, plan.id, { period: 9, reviewedByUserId: LEADER });

      // The variance is frozen at review time, so the March meeting still reads what March saw even
      // once September knows better. A review that recomputed itself would rewrite that history.
      expect(next.reviews[0]?.variance.state).toBe("on_track");
      expect(next.reviews[1]?.variance.state).toBe("off_track");
    });

    it("refuses a review nobody signed", async () => {
      const plan = await active();

      await expect(svc.review(T1, plan.id, { period: 6, reviewedByUserId: null })).rejects.toThrow(
        AnonymousPlanReviewError,
      );
      expect(publishedEvents).toEqual([]);
    });

    it("refuses a reviewer who is not a person", async () => {
      const plan = await active();

      await expect(
        svc.review(T1, plan.id, { period: 6, reviewedByUserId: STRANGER }),
      ).rejects.toThrow(PersonNotFoundForForecastError);
    });
  });

  // --- Reading ---------------------------------------------------------------------

  describe("reads", () => {
    it("finds a plan by key, by metric, by organization, by operation and across the tenant", async () => {
      const standing = await active();
      const draft = await drafted({
        planKey: "punctuality.lift",
        name: "Lift punctuality",
        objectives: [{ ...LIFT, objectiveKey: "punctuality.rate", metricKey: "punctuality.rate" }],
      });

      expect(await svc.get(T1, standing.id)).toEqual(standing);
      expect(await svc.findByKey(T1, ORG, "attendance.lift")).toEqual(standing);
      expect(await svc.listActive(T1)).toEqual([standing]);
      expect(await svc.listByMetric(T1, "attendance.rate")).toEqual([standing]);
      expect(await svc.listByOrganization(T1, ORG)).toHaveLength(2);
      expect((await svc.list(T1)).map((plan) => plan.id)).toContain(draft.id);
    });

    it("keeps a plan out of another tenant's reach", async () => {
      const plan = await drafted();

      await expect(svc.get(T2, plan.id)).rejects.toThrow(StrategicPlanNotFoundError);
      expect(await svc.list(T2)).toEqual([]);
      expect(await svc.findByKey(T2, ORG, "attendance.lift")).toBeNull();
    });
  });

  // --- Without a bus ---------------------------------------------------------------

  it("works without an event bus", async () => {
    const quiet = new StrategicPlanService({
      repository,
      organizations: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
      people: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
    });

    const plan = await quiet.draft(params());

    expect(await repository.findById(T1, plan.id)).toEqual(plan);
    expect(publishedEvents).toEqual([]);
  });
});
