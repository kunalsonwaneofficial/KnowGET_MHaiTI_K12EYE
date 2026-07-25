import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CoachingEngagementService } from "./coaching-engagement-service";
import { CoachingSessionService } from "./coaching-session-service";
import { CompetencyFrameworkService } from "./competency-framework-service";
import { DevelopmentGoalService } from "./development-goal-service";
import { DevelopmentService } from "./development-service";
import { FacultyProfileService } from "./faculty-profile-service";
import { ObservationService } from "./observation-service";
import {
  type EmployeeDirectory,
  InMemoryCoachingEngagementRepository,
  InMemoryCoachingSessionRepository,
  InMemoryCompetencyFrameworkRepository,
  InMemoryDevelopmentGoalRepository,
  InMemoryDevelopmentRequirementRepository,
  InMemoryFacultyProfileRepository,
  InMemoryObservationRepository,
  InMemoryProfessionalLearningActivityRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const TEACHER = "33333333-3333-3333-3333-333333333333" as Uuid;
const COACH = "44444444-4444-4444-4444-444444444444" as Uuid;

/**
 * End-to-end: an institution adopts a competency framework, a coach observes a teacher against it,
 * a coaching engagement is run with a session, the teacher completes required CPD and achieves a
 * development goal, and finally a descriptive faculty profile is refreshed and rolled up —
 * exercising every aggregate and both pure engines through the real services.
 */
describe("faculty-excellence integration", () => {
  it("runs the full observe-coach-develop-insight lifecycle across all services", async () => {
    const frameworks = new InMemoryCompetencyFrameworkRepository();
    const observations = new InMemoryObservationRepository();
    const engagements = new InMemoryCoachingEngagementRepository();
    const requirements = new InMemoryDevelopmentRequirementRepository();
    const activities = new InMemoryProfessionalLearningActivityRepository();
    const goals = new InMemoryDevelopmentGoalRepository();
    const orgs: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
    const employees: EmployeeDirectory = {
      exists: async (_t, id) => id === TEACHER || id === COACH,
      organizationOf: async (_t, id) => (id === TEACHER || id === COACH ? ORG : null),
    };

    const frameworkSvc = new CompetencyFrameworkService({
      repository: frameworks,
      organizations: orgs,
    });
    const observationSvc = new ObservationService({
      repository: observations,
      frameworks,
      employees,
    });
    const engagementSvc = new CoachingEngagementService({
      repository: engagements,
      employees,
      organizations: orgs,
    });
    const sessionSvc = new CoachingSessionService({
      repository: new InMemoryCoachingSessionRepository(),
      engagements,
    });
    const developmentSvc = new DevelopmentService({ requirements, activities, employees });
    const goalSvc = new DevelopmentGoalService({ repository: goals, employees });
    const profileSvc = new FacultyProfileService({
      repository: new InMemoryFacultyProfileRepository(),
      employees,
      observations,
      goals,
      requirements,
      activities,
    });

    // 1. Framework: author, add a competency, adopt
    const framework = await frameworkSvc.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "TEACH-STD",
      name: "Teaching Standards",
      competencies: [{ key: "ped-1", name: "Questioning" }],
    });
    await frameworkSvc.addCompetency(TENANT, framework.id, { key: "mgmt-1", name: "Management" });
    await frameworkSvc.activate(TENANT, framework.id);

    // 2. Observation: schedule → conduct → share → acknowledge
    let observation = await observationSvc.schedule({
      tenantId: TENANT,
      frameworkId: framework.id,
      employeeId: TEACHER,
      observerId: COACH,
      observationType: "formal",
      observedOn: "2026-05-10",
    });
    observation = await observationSvc.conduct(TENANT, observation.id, {
      ratings: [
        { competencyKey: "ped-1", rating: 4 },
        { competencyKey: "mgmt-1", rating: 3 },
      ],
      strengths: "Strong questioning",
    });
    await observationSvc.share(TENANT, observation.id);
    observation = await observationSvc.acknowledge(TENANT, observation.id);
    expect(observation.overallRating).toBe(3.5);

    // 3. Coaching: propose → accept, then log a session
    const engagement = await engagementSvc.propose({
      tenantId: TENANT,
      organizationId: ORG,
      coachId: COACH,
      coacheeId: TEACHER,
      focus: "Questioning techniques",
    });
    await engagementSvc.accept(TENANT, engagement.id);
    await sessionSvc.log({
      tenantId: TENANT,
      engagementId: engagement.id,
      notes: "Modelled think-pair-share",
      nextSteps: "Try in next lesson",
    });
    expect(await sessionSvc.listForEngagement(TENANT, engagement.id)).toHaveLength(1);

    // 4. PD: require 10 pedagogy hours, complete a 12-hour activity
    await developmentSvc.setRequirement({
      tenantId: TENANT,
      employeeId: TEACHER,
      category: "pedagogy",
      period: "2026",
      requiredHours: 10,
    });
    const activity = await developmentSvc.plan({
      tenantId: TENANT,
      employeeId: TEACHER,
      title: "Questioning masterclass",
      category: "pedagogy",
      hours: 12,
      startDate: "2026-04-01",
    });
    await developmentSvc.complete(TENANT, activity.id);
    const ledger = await developmentSvc.computeLedger(TENANT, TEACHER, "2026");
    expect(ledger.complianceRate).toBe(100); // 12 completed vs 10 required, capped

    // 5. Goal: draft → activate → achieve
    const g = await goalSvc.draft({
      tenantId: TENANT,
      employeeId: TEACHER,
      description: "Embed wait time",
      targetCompetencyKey: "ped-1",
    });
    await goalSvc.activate(TENANT, g.id);
    await goalSvc.achieve(TENANT, g.id, "Consistent across lessons");

    // 6. Profile: refresh the descriptive indicators and roll up the org
    const profile = await profileSvc.refresh(TENANT, TEACHER, "2026");
    expect(profile.observationsConsidered).toBe(1);
    expect(profile.averageObservationRating).toBe(3.5);
    expect(profile.competenciesObserved).toBe(2);
    expect(profile.goalsTotal).toBe(1);
    expect(profile.goalsAchieved).toBe(1);
    expect(profile.goalProgressPct).toBe(100);
    expect(profile.developmentComplianceRate).toBe(100);
    expect(profile.growthBand).toBe("distinguished"); // 3.5

    const summary = await profileSvc.summarizeOrganization(TENANT, ORG);
    expect(summary.headcount).toBe(1);
    expect(summary.distinguishedCount).toBe(1);
    expect(summary.needsSupportCount).toBe(0);
  });
});
