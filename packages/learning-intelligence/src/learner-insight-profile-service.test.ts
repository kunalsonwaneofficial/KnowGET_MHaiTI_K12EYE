import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { captureLearningSignal } from "./learning-signal";
import { PROFILE_REFRESHED } from "./learning-intelligence-events";
import { LearnerInsightProfileService } from "./learner-insight-profile-service";
import {
  InMemoryLearnerInsightProfileRepository,
  InMemoryLearningSignalRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("LearnerInsightProfileService", () => {
  let profiles: InMemoryLearnerInsightProfileRepository;
  let signals: InMemoryLearningSignalRepository;
  let events: DomainEvent[];
  let service: LearnerInsightProfileService;

  beforeEach(() => {
    profiles = new InMemoryLearnerInsightProfileRepository();
    signals = new InMemoryLearningSignalRepository();
    events = [];
    service = new LearnerInsightProfileService({
      repository: profiles,
      signals,
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([STUDENT]) as StudentDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  const seed = (dimension: "academic" | "attendance", value: number) =>
    signals.save(
      captureLearningSignal({
        tenantId: TENANT,
        organizationId: ORG,
        studentId: STUDENT,
        dimension,
        source: dimension === "academic" ? "assessment_evaluation" : "attendance_presence",
        metric: "m",
        value,
      }),
    );

  it("ensures exactly one profile per student (idempotent), starting insufficient", async () => {
    const a = await service.ensure(TENANT, ORG, STUDENT);
    const b = await service.ensure(TENANT, ORG, STUDENT);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("insufficient_data");
    expect(a.dimensionsCovered).toBe(0);
  });

  it("refreshes the profile from the learner's signals, banding and versioning", async () => {
    await seed("academic", 90);
    await seed("academic", 80);
    await seed("attendance", 40);

    const refreshed = await service.refreshForStudent(TENANT, ORG, STUDENT);
    expect(refreshed.status).toBe("synthesized");
    expect(refreshed.dimensionsCovered).toBe(2);
    expect(refreshed.signalsConsidered).toBe(3);
    // academic (85) + attendance (40) → overall 62.5 (watch)
    expect(refreshed.overallScore).toBe(62.5);
    expect(refreshed.overallBand).toBe("watch");
    expect(refreshed.version).toBe(2); // created at 1, refreshed to 2
    expect(events.map((e) => e.type)).toEqual([PROFILE_REFRESHED]);

    const academic = refreshed.dimensions.find((d) => d.dimension === "academic");
    expect(academic?.score).toBe(85);
    expect(academic?.band).toBe("on_track");
  });
});
