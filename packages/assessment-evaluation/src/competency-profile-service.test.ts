import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { COMPETENCY_UPDATED } from "./assessment-evaluation-events";
import { CompetencyProfileService } from "./competency-profile-service";
import {
  InMemoryCompetencyProfileRepository,
  type OrganizationDirectory,
  type StudentDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const STUDENT = "stu-1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

describe("CompetencyProfileService", () => {
  let repository: InMemoryCompetencyProfileRepository;
  let events: DomainEvent[];
  let service: CompetencyProfileService;

  beforeEach(() => {
    repository = new InMemoryCompetencyProfileRepository();
    events = [];
    service = new CompetencyProfileService({
      repository,
      organizations: allow([ORG]) as OrganizationDirectory,
      students: allow([STUDENT]) as StudentDirectory,
      events: { publish: async (e) => void events.push(e) },
    });
  });

  it("ensures exactly one profile per student (idempotent)", async () => {
    const a = await service.ensure(TENANT, ORG, STUDENT);
    const b = await service.ensure(TENANT, ORG, STUDENT);
    expect(a.id).toBe(b.id);
  });

  it("upserts mastery, records the trajectory on change, and emits the event", async () => {
    const profile = await service.ensure(TENANT, ORG, STUDENT);
    const p1 = await service.setMastery(TENANT, profile.id, {
      competencyId: "C.MATH.1",
      name: "Number sense",
      masteryLevel: "developing",
      evidenceRefs: ["ev1" as Uuid],
    });
    expect(p1.competencies).toHaveLength(1);
    expect(p1.trajectory).toHaveLength(1);
    expect(p1.version).toBe(2);

    // advancing the level records another trajectory entry and bumps the version
    const p2 = await service.setMastery(TENANT, profile.id, {
      competencyId: "C.MATH.1",
      name: "Number sense",
      masteryLevel: "proficient",
    });
    expect(p2.competencies).toHaveLength(1);
    expect(p2.competencies[0]?.masteryLevel).toBe("proficient");
    expect(p2.trajectory).toHaveLength(2);
    expect(p2.trajectory[1]).toMatchObject({ fromLevel: "developing", toLevel: "proficient" });
    expect(p2.version).toBe(3);

    // re-setting the same level does not add a trajectory entry or bump the version
    const p3 = await service.setMastery(TENANT, profile.id, {
      competencyId: "C.MATH.1",
      name: "Number sense",
      masteryLevel: "proficient",
    });
    expect(p3.trajectory).toHaveLength(2);
    expect(p3.version).toBe(3);

    expect(events.map((e) => e.type)).toEqual([
      COMPETENCY_UPDATED,
      COMPETENCY_UPDATED,
      COMPETENCY_UPDATED,
    ]);
  });
});
