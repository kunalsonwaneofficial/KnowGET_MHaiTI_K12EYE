import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  GovernanceBodyNotFoundError,
  OrganizationNotFoundForGovernanceError,
  ParentGovernanceBodyNotFoundError,
} from "./errors";
import { GovernanceBodyService } from "./governance-body-service";
import { InMemoryGovernanceBodyRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const MISSING = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDirectory = (known: ReadonlySet<string> = new Set([ORG])): OrganizationDirectory => ({
  exists: async (_tenant, id) => known.has(id),
});

let repository: InMemoryGovernanceBodyRepository;
let events: DomainEvent[];
let service: GovernanceBodyService;

beforeEach(() => {
  repository = new InMemoryGovernanceBodyRepository();
  events = [];
  service = new GovernanceBodyService({
    repository,
    organizations: orgDirectory(),
    events: { publish: async (e) => void events.push(e) },
  });
});

describe("GovernanceBodyService", () => {
  it("establishes a body and publishes governance.body.created", async () => {
    const body = await service.establish({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Board of Trustees",
      type: "board_of_trustees",
    });
    expect(body.status).toBe("active");
    expect(await service.getById(TENANT, body.id)).toEqual(body);
    expect(events.map((e) => e.type)).toEqual(["governance.body.created"]);
  });

  it("rejects a body attached to an unknown organization", async () => {
    await expect(
      service.establish({
        tenantId: TENANT,
        organizationId: MISSING,
        name: "Orphan",
        type: "other",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForGovernanceError);
  });

  it("nests a child under a parent and lists the hierarchy", async () => {
    const parent = await service.establish({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Board of Trustees",
      type: "board_of_trustees",
    });
    const child = await service.establish({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Finance Committee",
      type: "finance_committee",
      parentBodyId: parent.id,
    });
    expect((await service.children(TENANT, parent.id)).map((b) => b.id)).toEqual([child.id]);
    expect((await service.listForOrganization(TENANT, ORG)).length).toBe(2);
  });

  it("rejects nesting under a missing parent", async () => {
    await expect(
      service.establish({
        tenantId: TENANT,
        organizationId: ORG,
        name: "Detached",
        type: "other",
        parentBodyId: MISSING,
      }),
    ).rejects.toBeInstanceOf(ParentGovernanceBodyNotFoundError);
  });

  it("dissolves a body and publishes governance.body.dissolved", async () => {
    const body = await service.establish({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Executive Committee",
      type: "executive_committee",
    });
    const dissolved = await service.dissolve(TENANT, body.id, "2026-07-18");
    expect(dissolved.status).toBe("dissolved");
    expect(events.map((e) => e.type)).toEqual([
      "governance.body.created",
      "governance.body.dissolved",
    ]);
  });

  it("isolates tenants: a body is invisible to another tenant", async () => {
    const body = await service.establish({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Board",
      type: "board_of_trustees",
    });
    const other = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
    await expect(service.getById(other, body.id)).rejects.toBeInstanceOf(
      GovernanceBodyNotFoundError,
    );
  });
});
