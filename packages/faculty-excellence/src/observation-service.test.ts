import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  activateFramework,
  type CompetencyFramework,
  createFramework,
} from "./competency-framework";
import {
  EmployeeNotFoundForFacultyError,
  FrameworkNotActiveError,
  UnknownCompetencyError,
} from "./errors";
import { ObservationService } from "./observation-service";
import {
  type EmployeeDirectory,
  InMemoryCompetencyFrameworkRepository,
  InMemoryObservationRepository,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "44444444-4444-4444-4444-444444444444" as Uuid;
const OBSERVER = "55555555-5555-5555-5555-555555555555" as Uuid;

const employees: EmployeeDirectory = {
  exists: async (_t, id) => id === EMPLOYEE || id === OBSERVER,
  organizationOf: async (_t, id) => (id === EMPLOYEE || id === OBSERVER ? ORG : null),
};

const activeFramework = (): CompetencyFramework =>
  activateFramework(
    createFramework({
      tenantId: TENANT,
      organizationId: ORG,
      code: "TEACH-STD",
      name: "Teaching Standards",
      competencies: [
        { key: "ped-1", name: "Planning" },
        { key: "mgmt-1", name: "Management" },
      ],
    }),
  );

async function harness(frameworks: CompetencyFramework[] = []) {
  const frameworkRepo = new InMemoryCompetencyFrameworkRepository();
  for (const f of frameworks) {
    await frameworkRepo.save(f);
  }
  const events: DomainEvent[] = [];
  const svc = new ObservationService({
    repository: new InMemoryObservationRepository(),
    frameworks: frameworkRepo,
    employees,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, frameworkRepo, events };
}

const schedule = (frameworkId: Uuid) =>
  ({
    tenantId: TENANT,
    frameworkId,
    employeeId: EMPLOYEE,
    observerId: OBSERVER,
    observationType: "formal" as const,
    observedOn: "2026-05-10",
  }) as const;

describe("ObservationService", () => {
  it("schedules against an active framework, deriving the organization", async () => {
    const fw = activeFramework();
    const { svc } = await harness([fw]);
    const obs = await svc.schedule(schedule(fw.id));
    expect(obs.organizationId).toBe(ORG);
    expect(obs.status).toBe("scheduled");
  });

  it("rejects an inactive framework and an unknown observer", async () => {
    const draft = createFramework({
      tenantId: TENANT,
      organizationId: ORG,
      code: "D",
      name: "Draft",
      competencies: [{ key: "ped-1", name: "Planning" }],
    });
    const { svc } = await harness([draft]);
    await expect(svc.schedule(schedule(draft.id))).rejects.toBeInstanceOf(FrameworkNotActiveError);

    const fw = activeFramework();
    const { svc: svc2 } = await harness([fw]);
    await expect(
      svc2.schedule({
        ...schedule(fw.id),
        observerId: "00000000-0000-0000-0000-000000000000" as Uuid,
      }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundForFacultyError);
  });

  it("validates ratings against the framework and runs the lifecycle with events", async () => {
    const fw = activeFramework();
    const { svc, events } = await harness([fw]);
    const obs = await svc.schedule(schedule(fw.id));

    await expect(
      svc.conduct(TENANT, obs.id, { ratings: [{ competencyKey: "nope", rating: 3 }] }),
    ).rejects.toBeInstanceOf(UnknownCompetencyError);

    await svc.conduct(TENANT, obs.id, {
      ratings: [
        { competencyKey: "ped-1", rating: 3 },
        { competencyKey: "mgmt-1", rating: 4 },
      ],
    });
    await svc.share(TENANT, obs.id);
    await svc.acknowledge(TENANT, obs.id);

    expect(events.map((e) => e.type)).toEqual([
      "faculty.observation.conducted",
      "faculty.observation.shared",
      "faculty.observation.acknowledged",
    ]);
    expect((await svc.getById(TENANT, obs.id)).overallRating).toBe(3.5);
    expect(await svc.listForEmployee(TENANT, EMPLOYEE)).toHaveLength(1);
  });
});
