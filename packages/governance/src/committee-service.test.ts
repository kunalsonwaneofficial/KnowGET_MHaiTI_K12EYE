import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import { CommitteeService } from "./committee-service";
import {
  CommitteeNotFoundError,
  OrganizationNotFoundForGovernanceError,
  ParentGovernanceBodyNotFoundError,
  PersonNotFoundForGovernanceError,
} from "./errors";
import { GovernanceBodyService } from "./governance-body-service";
import {
  InMemoryCommitteeRepository,
  InMemoryGovernanceBodyRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;
const MISSING = "99999999-9999-9999-9999-999999999999" as Uuid;

const orgDir: OrganizationDirectory = { exists: async (_t, id) => id === ORG };
const personDir: PersonDirectory = { exists: async (_t, id) => id === ALICE };

let repository: InMemoryCommitteeRepository;
let bodies: InMemoryGovernanceBodyRepository;
let events: DomainEvent[];
let service: CommitteeService;

beforeEach(() => {
  repository = new InMemoryCommitteeRepository();
  bodies = new InMemoryGovernanceBodyRepository();
  events = [];
  service = new CommitteeService({
    repository,
    organizations: orgDir,
    persons: personDir,
    governanceBodies: bodies,
    events: { publish: async (e) => void events.push(e) },
  });
});

describe("CommitteeService", () => {
  it("forms a committee and publishes governance.committee.created", async () => {
    const committee = await service.form({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Academic Committee",
    });
    expect(await service.getById(TENANT, committee.id)).toEqual(committee);
    expect(events.map((e) => e.type)).toEqual(["governance.committee.created"]);
  });

  it("rejects an unknown organization", async () => {
    await expect(
      service.form({ tenantId: TENANT, organizationId: MISSING, name: "Orphan" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForGovernanceError);
  });

  it("validates a reporting governance body exists", async () => {
    await expect(
      service.form({
        tenantId: TENANT,
        organizationId: ORG,
        name: "Sub-committee",
        governanceBodyId: MISSING,
      }),
    ).rejects.toBeInstanceOf(ParentGovernanceBodyNotFoundError);

    const body = await new GovernanceBodyService({
      repository: bodies,
      organizations: orgDir,
    }).establish({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Board",
      type: "board_of_trustees",
    });
    const committee = await service.form({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Finance Sub-committee",
      governanceBodyId: body.id,
    });
    expect(committee.governanceBodyId).toBe(body.id);
  });

  it("appoints a member who must be a Person in the tenant", async () => {
    const committee = await service.form({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Exam Committee",
    });
    await expect(
      service.appoint(TENANT, committee.id, { personId: MISSING, role: "member" }),
    ).rejects.toBeInstanceOf(PersonNotFoundForGovernanceError);
    const updated = await service.appoint(TENANT, committee.id, { personId: ALICE, role: "chair" });
    expect(updated.members).toHaveLength(1);
  });

  it("isolates tenants", async () => {
    const committee = await service.form({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Board Committee",
    });
    const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as TenantId;
    await expect(service.getById(other, committee.id)).rejects.toBeInstanceOf(
      CommitteeNotFoundError,
    );
  });
});
