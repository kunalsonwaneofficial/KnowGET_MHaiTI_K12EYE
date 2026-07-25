import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AcademicProgramService } from "./academic-program-service";
import {
  AcademicProgramNotFoundError,
  DuplicateAcademicProgramError,
  OrganizationNotFoundForAcademicError,
} from "./errors";
import { InMemoryAcademicProgramRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

const service = () =>
  new AcademicProgramService({
    repository: new InMemoryAcademicProgramRepository(),
    organizations,
  });

const create = (svc: AcademicProgramService, code = "PRIM") =>
  svc.create({ tenantId: TENANT, organizationId: ORG, name: "Primary", code, stage: "primary" });

describe("AcademicProgramService", () => {
  it("creates a program against a validated organization", async () => {
    const svc = service();
    const p = await create(svc);
    expect(p.code).toBe("PRIM");
    expect(await svc.getById(TENANT, p.id)).toEqual(p);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown organization and a duplicate code", async () => {
    const svc = service();
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: UNKNOWN,
        name: "X",
        code: "X",
        stage: "custom",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAcademicError);
    await create(svc);
    await expect(create(svc)).rejects.toBeInstanceOf(DuplicateAcademicProgramError);
    // a different code is fine
    expect(await create(svc, "SEC")).toBeDefined();
  });

  it("drives the mutation surface and reports a missing program", async () => {
    const svc = service();
    const p = await create(svc);
    await svc.rename(TENANT, p.id, "Lower Primary");
    await svc.setStage(TENANT, p.id, "middle");
    const described = await svc.setDescription(TENANT, p.id, "Grades 1-5");
    expect(described.name).toBe("Lower Primary");
    expect(described.stage).toBe("middle");
    expect(described.description).toBe("Grades 1-5");
    const archived = await svc.archive(TENANT, p.id);
    expect(archived.status).toBe("archived");
    expect((await svc.activate(TENANT, p.id)).status).toBe("active");
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(AcademicProgramNotFoundError);
  });
});
