import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateResourceError,
  OrganizationNotFoundForSchedulingError,
  ResourceNotFoundError,
  ResourceRetiredError,
} from "./errors";
import { InMemoryResourceRepository, type OrganizationDirectory } from "./ports";
import { ResourceService } from "./resource-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgs: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

const service = () =>
  new ResourceService({ repository: new InMemoryResourceRepository(), organizations: orgs });

const create = (svc: ResourceService, code = "LAB-1") =>
  svc.create({
    tenantId: TENANT,
    organizationId: ORG,
    code,
    name: "Science Lab",
    kind: "laboratory",
    capacity: 30,
  });

describe("ResourceService", () => {
  it("creates a resource and reads it back by code", async () => {
    const svc = service();
    const r = await create(svc);
    expect(r.status).toBe("available");
    expect(r.capacity).toBe(30);
    expect(await svc.getByCode(TENANT, ORG, "LAB-1")).toEqual(r);
  });

  it("rejects an unknown org and a duplicate code", async () => {
    const svc = service();
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: UNKNOWN,
        code: "X",
        name: "X",
        kind: "classroom",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForSchedulingError);
    await create(svc);
    await expect(create(svc)).rejects.toBeInstanceOf(DuplicateResourceError);
  });

  it("moves through the maintenance/retire lifecycle and blocks mutation once retired", async () => {
    const svc = service();
    const r = await create(svc);
    expect((await svc.markMaintenance(TENANT, r.id)).status).toBe("maintenance");
    expect((await svc.markAvailable(TENANT, r.id)).status).toBe("available");
    await svc.retire(TENANT, r.id);
    await expect(svc.rename(TENANT, r.id, "New name")).rejects.toBeInstanceOf(ResourceRetiredError);
  });

  it("reports a missing resource", async () => {
    await expect(service().getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
