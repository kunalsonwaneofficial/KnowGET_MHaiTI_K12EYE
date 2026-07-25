import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { CohortInsightService } from "./cohort-insight-service";
import { CohortInsightStateError, DuplicateCohortInsightError } from "./errors";
import { LearnerInsightProfileService } from "./learner-insight-profile-service";
import { captureLearningSignal } from "./learning-signal";
import {
  InMemoryCohortInsightRepository,
  InMemoryLearnerInsightProfileRepository,
  InMemoryLearningSignalRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SECTION = "sec-1" as Uuid;
const S1 = "stu-1" as Uuid;
const S2 = "stu-2" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("CohortInsightService", () => {
  let cohorts: InMemoryCohortInsightRepository;
  let profileRepo: InMemoryLearnerInsightProfileRepository;
  let signalRepo: InMemoryLearningSignalRepository;
  let profileService: LearnerInsightProfileService;
  let service: CohortInsightService;

  beforeEach(() => {
    cohorts = new InMemoryCohortInsightRepository();
    profileRepo = new InMemoryLearnerInsightProfileRepository();
    signalRepo = new InMemoryLearningSignalRepository();
    profileService = new LearnerInsightProfileService({
      repository: profileRepo,
      signals: signalRepo,
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([S1, S2]) as StudentDirectory,
    });
    service = new CohortInsightService({
      repository: cohorts,
      profiles: profileRepo,
      organizations: allow([ORG]) as OrganizationDirectory,
    });
  });

  const seed = async (student: Uuid, value: number) => {
    await signalRepo.save(
      captureLearningSignal({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: student,
        dimension: "academic",
        source: "assessment_evaluation",
        metric: "avg",
        value,
      }),
    );
    await profileService.refreshForStudent(TENANT, ORG, student);
  };

  it("rolls up the organization's synthesized learner profiles into band distribution", async () => {
    await seed(S1, 90); // on_track
    await seed(S2, 30); // at_risk

    const cohort = await service.create({
      tenantId: TENANT,
      organizationId: ORG,
      scopeType: "organization",
      scopeId: ORG,
      label: "Whole school",
    });
    const refreshed = await service.refresh(TENANT, cohort.id);

    expect(refreshed.learnersConsidered).toBe(2);
    expect(refreshed.averageLearningHealth).toBe(60); // (90 + 30) / 2
    expect(refreshed.averageBand).toBe("watch");
    expect(refreshed.bandDistribution.on_track).toBe(1);
    expect(refreshed.bandDistribution.at_risk).toBe(1);
    expect(refreshed.learnersNeedingAttention).toBe(1); // only the at_risk learner
    expect(refreshed.version).toBe(2);
  });

  it("enforces one cohort insight per (scope type, scope id)", async () => {
    const create = () =>
      service.create({
        tenantId: TENANT,
        organizationId: ORG,
        scopeType: "section",
        scopeId: SECTION,
        label: "Section A",
      });
    await create();
    await expect(create()).rejects.toBeInstanceOf(DuplicateCohortInsightError);
  });

  it("scopes the rollup to explicit members and freezes members after publish", async () => {
    await seed(S1, 90);
    await seed(S2, 30);

    const cohort = await service.create({
      tenantId: TENANT,
      organizationId: ORG,
      scopeType: "section",
      scopeId: SECTION,
      label: "Section A",
      memberStudentIds: [S1],
    });
    const refreshed = await service.refresh(TENANT, cohort.id);
    // only S1 is a member → only the on_track learner counts
    expect(refreshed.learnersConsidered).toBe(1);
    expect(refreshed.averageLearningHealth).toBe(90);
    expect(refreshed.learnersNeedingAttention).toBe(0);

    await service.publish(TENANT, cohort.id);
    await expect(service.setMembers(TENANT, cohort.id, [S1, S2])).rejects.toBeInstanceOf(
      CohortInsightStateError,
    );
  });
});
