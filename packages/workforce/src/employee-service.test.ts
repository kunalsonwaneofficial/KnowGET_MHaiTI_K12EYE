import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { createDepartment } from "./department";
import { EmployeeService } from "./employee-service";
import {
  CrossOrganizationAssignmentError,
  DuplicateEmployeeNumberError,
  DuplicateEmploymentError,
  PersonNotFoundForWorkforceError,
} from "./errors";
import {
  InMemoryDepartmentRepository,
  InMemoryEmployeeRepository,
  InMemoryPositionRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const OTHER_ORG = "88888888-8888-8888-8888-888888888888" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG || id === OTHER_ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === PERSON };

async function harness() {
  const departments = new InMemoryDepartmentRepository();
  const positions = new InMemoryPositionRepository();
  const events: DomainEvent[] = [];
  const svc = new EmployeeService({
    repository: new InMemoryEmployeeRepository(),
    persons: personDir,
    organizations: orgDir,
    departments,
    positions,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, departments, events };
}

const onboard = (employeeNumber = "E-1") =>
  ({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    employeeNumber,
    employmentType: "full_time" as const,
  }) as const;

describe("EmployeeService", () => {
  it("onboards, runs the lifecycle and publishes events", async () => {
    const { svc, events } = await harness();
    const e = await svc.onboard(onboard());
    await svc.activate(TENANT, e.id);
    await svc.giveNotice(TENANT, e.id);
    await svc.resign(TENANT, e.id, "2027-06-30");
    const alumni = await svc.becomeAlumni(TENANT, e.id);
    expect(alumni.status).toBe("alumni");
    expect(events.map((ev) => ev.type)).toEqual([
      "workforce.employee.onboarded",
      "workforce.employee.activated",
      "workforce.employee.separated",
      "workforce.employee.became_alumni",
    ]);
    expect((await svc.getByEmployeeNumber(TENANT, "E-1")).personId).toBe(PERSON);
  });

  it("enforces a unique employee number, one active employment and a known person", async () => {
    const { svc } = await harness();
    await svc.onboard(onboard("DUP"));
    await expect(svc.onboard(onboard("DUP"))).rejects.toBeInstanceOf(DuplicateEmployeeNumberError);
    await expect(svc.onboard(onboard("OTHER"))).rejects.toBeInstanceOf(DuplicateEmploymentError);
    await expect(
      svc.onboard({
        ...onboard("X"),
        personId: "00000000-0000-0000-0000-000000000000" as Uuid,
      }),
    ).rejects.toBeInstanceOf(PersonNotFoundForWorkforceError);
  });

  it("rejects assigning a department from another organization", async () => {
    const { svc, departments } = await harness();
    const foreign = createDepartment({
      tenantId: TENANT,
      organizationId: OTHER_ORG,
      code: "X",
      name: "X",
    });
    await departments.save(foreign);
    const e = await svc.onboard(onboard());
    await expect(svc.assignDepartment(TENANT, e.id, foreign.id)).rejects.toBeInstanceOf(
      CrossOrganizationAssignmentError,
    );
  });
});
