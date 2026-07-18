import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import {
  InMemoryRelationshipRepository,
  type PersonDirectory,
  RelationshipService,
} from "@knowget/relationship";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { RelationshipController } from "./relationship.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRACE = "33333333-3333-3333-3333-333333333333" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyPerson: PersonDirectory = { exists: async () => true };

function controller(): RelationshipController {
  return new RelationshipController(
    new RelationshipService({
      repository: new InMemoryRelationshipRepository(),
      persons: anyPerson,
    }),
  );
}

const guardianBody = { fromPersonId: ADA, toPersonId: GRACE, kind: "guardian" };

describe("RelationshipController", () => {
  it("relates two people, lists and reads back the relationship", async () => {
    const ctrl = controller();
    const rel = await ctrl.relate(principal, guardianBody);
    expect(rel.status).toBe("active");
    expect(rel.kind).toBe("guardian");
    expect((await ctrl.getById(principal, rel.id)).fromPersonId).toBe(ADA);
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listForPerson(principal, GRACE)).toHaveLength(1);
  });

  it("ends a relationship", async () => {
    const ctrl = controller();
    const rel = await ctrl.relate(principal, guardianBody);
    expect((await ctrl.end(principal, rel.id, { endDate: "2030-06-01" })).status).toBe("ended");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.relate(principal, { fromPersonId: "not-a-uuid", toPersonId: GRACE, kind: "guardian" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      ctrl.relate(principal, { fromPersonId: ADA, toPersonId: GRACE, kind: "cousin" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
