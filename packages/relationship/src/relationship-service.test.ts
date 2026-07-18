import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateRelationshipError,
  PersonNotFoundForRelationshipError,
  RelationshipNotFoundError,
  SelfRelationshipError,
} from "./errors";
import type { PersonDirectory } from "./ports";
import { InMemoryRelationshipRepository } from "./ports";
import { RelationshipService } from "./relationship-service";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRACE = "33333333-3333-3333-3333-333333333333" as Uuid;
const LINN = "44444444-4444-4444-4444-444444444444" as Uuid;
const GHOST = "99999999-9999-9999-9999-999999999999" as Uuid;

/** Person directory that knows a fixed set of tenant-scoped people. */
class FakePersonDirectory implements PersonDirectory {
  private readonly known = new Set<string>();
  constructor(people: ReadonlyArray<[TenantId, Uuid]>) {
    for (const [tenant, person] of people) {
      this.known.add(`${tenant}:${person}`);
    }
  }
  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    return this.known.has(`${tenantId}:${personId}`);
  }
}

function build(): { service: RelationshipService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const service = new RelationshipService({
    repository: new InMemoryRelationshipRepository(),
    persons: new FakePersonDirectory([
      [TENANT_A, ADA],
      [TENANT_A, GRACE],
      [TENANT_A, LINN],
    ]),
    events: { publish: async (event: DomainEvent) => void events.push(event) },
  });
  return { service, events };
}

describe("RelationshipService — relate", () => {
  let service: RelationshipService;
  let events: DomainEvent[];
  beforeEach(() => {
    ({ service, events } = build());
  });

  it("relates two existing people and emits an event", async () => {
    const rel = await service.relate({
      tenantId: TENANT_A,
      fromPersonId: ADA,
      toPersonId: GRACE,
      kind: "guardian",
    });
    expect(rel.status).toBe("active");
    expect(events.map((e) => e.type)).toContain("relationship.created");
  });

  it("rejects self-relationships and unknown people", async () => {
    await expect(
      service.relate({ tenantId: TENANT_A, fromPersonId: ADA, toPersonId: ADA, kind: "sibling" }),
    ).rejects.toBeInstanceOf(SelfRelationshipError);
    await expect(
      service.relate({
        tenantId: TENANT_A,
        fromPersonId: ADA,
        toPersonId: GHOST,
        kind: "guardian",
      }),
    ).rejects.toBeInstanceOf(PersonNotFoundForRelationshipError);
  });

  it("rejects a duplicate directed relationship but allows the opposite direction", async () => {
    await service.relate({
      tenantId: TENANT_A,
      fromPersonId: ADA,
      toPersonId: GRACE,
      kind: "guardian",
    });
    await expect(
      service.relate({
        tenantId: TENANT_A,
        fromPersonId: ADA,
        toPersonId: GRACE,
        kind: "guardian",
      }),
    ).rejects.toBeInstanceOf(DuplicateRelationshipError);
    // Opposite direction is a distinct guardian edge.
    await expect(
      service.relate({
        tenantId: TENANT_A,
        fromPersonId: GRACE,
        toPersonId: ADA,
        kind: "guardian",
      }),
    ).resolves.toBeDefined();
  });

  it("treats symmetric relationships as unordered when de-duplicating", async () => {
    await service.relate({
      tenantId: TENANT_A,
      fromPersonId: ADA,
      toPersonId: GRACE,
      kind: "sibling",
    });
    await expect(
      service.relate({ tenantId: TENANT_A, fromPersonId: GRACE, toPersonId: ADA, kind: "sibling" }),
    ).rejects.toBeInstanceOf(DuplicateRelationshipError);
  });
});

describe("RelationshipService — query & lifecycle", () => {
  let service: RelationshipService;
  beforeEach(() => {
    ({ service } = build());
  });

  it("lists every relationship touching a person", async () => {
    await service.relate({
      tenantId: TENANT_A,
      fromPersonId: ADA,
      toPersonId: GRACE,
      kind: "guardian",
    });
    await service.relate({
      tenantId: TENANT_A,
      fromPersonId: LINN,
      toPersonId: GRACE,
      kind: "sibling",
    });
    expect(await service.listForPerson(TENANT_A, GRACE)).toHaveLength(2);
    expect(await service.listForPerson(TENANT_A, ADA)).toHaveLength(1);
  });

  it("ends a relationship, freeing an equivalent new one", async () => {
    const rel = await service.relate({
      tenantId: TENANT_A,
      fromPersonId: ADA,
      toPersonId: GRACE,
      kind: "guardian",
    });
    expect((await service.end(TENANT_A, rel.id, "2030-06-01")).status).toBe("ended");
    // With the previous one ended, an equivalent relationship can be created again.
    await expect(
      service.relate({
        tenantId: TENANT_A,
        fromPersonId: ADA,
        toPersonId: GRACE,
        kind: "guardian",
      }),
    ).resolves.toBeDefined();
  });

  it("does not see another tenant's relationship", async () => {
    const rel = await service.relate({
      tenantId: TENANT_A,
      fromPersonId: ADA,
      toPersonId: GRACE,
      kind: "guardian",
    });
    await expect(service.getById(TENANT_B, rel.id)).rejects.toBeInstanceOf(
      RelationshipNotFoundError,
    );
  });
});
