import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { activateGoal, draftGoal, type DevelopmentGoal } from "./development-goal";
import { setRequirement } from "./development-requirement";
import { EmployeeNotFoundForFacultyError, FacultyProfileNotFoundError } from "./errors";
import { FacultyProfileService } from "./faculty-profile-service";
import {
  acknowledgeObservation,
  conductObservation,
  type Observation,
  scheduleObservation,
  shareObservation,
} from "./observation";
import {
  completeActivity,
  planActivity,
  type ProfessionalLearningActivity,
} from "./professional-learning-activity";
import {
  type EmployeeDirectory,
  InMemoryDevelopmentGoalRepository,
  InMemoryDevelopmentRequirementRepository,
  InMemoryFacultyProfileRepository,
  InMemoryObservationRepository,
  InMemoryProfessionalLearningActivityRepository,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const FW = "33333333-3333-3333-3333-333333333333" as Uuid;

const employees: EmployeeDirectory = {
  exists: async (_t, id) => id.startsWith("ee"),
  organizationOf: async (_t, id) => (id.startsWith("ee") ? ORG : null),
};

function harness() {
  const observations = new InMemoryObservationRepository();
  const goals = new InMemoryDevelopmentGoalRepository();
  const requirements = new InMemoryDevelopmentRequirementRepository();
  const activities = new InMemoryProfessionalLearningActivityRepository();
  const events: DomainEvent[] = [];
  const svc = new FacultyProfileService({
    repository: new InMemoryFacultyProfileRepository(),
    employees,
    observations,
    goals,
    requirements,
    activities,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, observations, goals, requirements, activities, events };
}

const acknowledgedObs = (employeeId: Uuid, rating: number): Observation =>
  acknowledgeObservation(
    shareObservation(
      conductObservation(
        scheduleObservation({
          tenantId: TENANT,
          organizationId: ORG,
          frameworkId: FW,
          employeeId,
          observerId: "ee-observer-000000000000000000000000" as Uuid,
          observationType: "formal",
        }),
        { ratings: [{ competencyKey: "ped-1", rating }] },
      ),
    ),
  );

const goal = (employeeId: Uuid, achieve: boolean): DevelopmentGoal => {
  const g = activateGoal(
    draftGoal({ tenantId: TENANT, organizationId: ORG, employeeId, description: "Goal" }),
  );
  return achieve ? { ...g, status: "achieved" } : g;
};

const completedActivity = (employeeId: Uuid): ProfessionalLearningActivity =>
  completeActivity(
    planActivity({
      tenantId: TENANT,
      organizationId: ORG,
      employeeId,
      title: "Workshop",
      category: "pedagogy",
      hours: 12,
      startDate: "2026-03-01",
    }),
  );

describe("FacultyProfileService", () => {
  it("refreshes a profile from observations, goals and PD compliance", async () => {
    const { svc, observations, goals, requirements, activities } = harness();
    const EE = "ee-1111111111111111111111111111111" as Uuid;
    await observations.save(acknowledgedObs(EE, 3));
    await observations.save(acknowledgedObs(EE, 4));
    await goals.save(goal(EE, true));
    await goals.save(goal(EE, false));
    await requirements.save(
      setRequirement({
        tenantId: TENANT,
        organizationId: ORG,
        employeeId: EE,
        category: "pedagogy",
        period: "2026",
        requiredHours: 20,
      }),
    );
    await activities.save(completedActivity(EE));

    const profile = await svc.refresh(TENANT, EE, "2026");
    expect(profile.status).toBe("refreshed");
    expect(profile.version).toBe(2);
    expect(profile.observationsConsidered).toBe(2);
    expect(profile.averageObservationRating).toBe(3.5);
    expect(profile.growthBand).toBe("distinguished"); // 3.5
    expect(profile.goalsTotal).toBe(2);
    expect(profile.goalsAchieved).toBe(1);
    expect(profile.goalProgressPct).toBe(50);
    expect(profile.developmentComplianceRate).toBe(60); // 12 of 20

    expect((await svc.getById(TENANT, profile.id)).employeeId).toBe(EE);
    await expect(
      svc.getById(TENANT, "00000000-0000-0000-0000-000000000000" as Uuid),
    ).rejects.toBeInstanceOf(FacultyProfileNotFoundError);
    await expect(
      svc.refresh(TENANT, "unknown-000000000000000000000000000" as Uuid, "2026"),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForFacultyError);
  });

  it("rolls up an organization's faculty growth", async () => {
    const { svc, observations, goals, requirements, activities } = harness();
    const strong = "ee-strong-11111111111111111111111" as Uuid;
    const weak = "ee-weak-2222222222222222222222222" as Uuid;
    await observations.save(acknowledgedObs(strong, 4));
    await observations.save(acknowledgedObs(weak, 1));
    void goals;
    void requirements;
    void activities;

    await svc.refresh(TENANT, strong, "2026");
    await svc.refresh(TENANT, weak, "2026");

    const summary = await svc.summarizeOrganization(TENANT, ORG);
    expect(summary.headcount).toBe(2);
    expect(summary.growthDistribution.distinguished).toBe(1); // rating 4
    expect(summary.growthDistribution.emerging).toBe(1); // rating 1
    expect(summary.distinguishedCount).toBe(1);
    expect(summary.needsSupportCount).toBe(1); // the emerging one
  });
});
