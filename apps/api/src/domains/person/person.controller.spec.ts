import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { InMemoryPersonRepository, PersonService } from "@knowget/person";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { PersonController } from "./person.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

function controller(): PersonController {
  return new PersonController(new PersonService(new InMemoryPersonRepository()));
}

const ada = { name: { given: "Ada", family: "Lovelace" }, dateOfBirth: "1815-12-10" };

describe("PersonController", () => {
  it("registers, reads and lists people for the caller's tenant", async () => {
    const ctrl = controller();
    const person = await ctrl.register(principal, ada);
    expect(person.status).toBe("active");
    expect((await ctrl.getById(principal, person.id)).name.given).toBe("Ada");
    expect(await ctrl.list(principal)).toHaveLength(1);
  });

  it("manages contacts and surfaces potential duplicates", async () => {
    const ctrl = controller();
    const person = await ctrl.register(principal, ada);
    const withContact = await ctrl.addContact(principal, person.id, {
      type: "email",
      value: "ada@x.com",
    });
    expect(withContact.contacts).toHaveLength(1);
    const dup = await ctrl.register(principal, { ...ada, allowDuplicate: true });
    expect(await ctrl.duplicates(principal, dup.id)).toHaveLength(1);
  });

  it("merges a duplicate into the survivor", async () => {
    const ctrl = controller();
    const survivor = await ctrl.register(principal, ada);
    const dup = await ctrl.register(principal, { ...ada, allowDuplicate: true });
    const merged = await ctrl.merge(principal, survivor.id, { mergedId: dup.id });
    expect(merged.id).toBe(survivor.id);
    expect((await ctrl.getById(principal, dup.id)).status).toBe("merged");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.register(principal, { name: { given: "", family: "" } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
