import type { Principal } from "@knowget/auth";
import {
  type CredentialHasher,
  IdentityAccountService,
  InMemoryIdentityAccountRepository,
  type PersonDirectory,
} from "@knowget/enterprise-identity";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { IdentityController } from "./identity.controller";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const principal: Principal = {
  id: "99999999-9999-9999-9999-999999999999" as Uuid,
  tenantId: TENANT,
  roles: ["administrator"],
  permissions: ["*"],
};
const noTenant: Principal = { id: "1" as Uuid, roles: [], permissions: [] };

const anyPerson: PersonDirectory = { exists: async () => true };
const hasher: CredentialHasher = { hash: (plaintext) => `hashed:${plaintext}` };

function controller(): IdentityController {
  return new IdentityController(
    new IdentityAccountService({
      repository: new InMemoryIdentityAccountRepository(),
      persons: anyPerson,
      hasher,
    }),
  );
}

const provisionBody = {
  personId: ADA,
  identifiers: [{ type: "email", value: "ada@school.edu" }],
  password: "s3cretpw!",
  activate: true,
};

describe("IdentityController", () => {
  it("provisions an account for a person and never returns the credential hash", async () => {
    const ctrl = controller();
    const view = await ctrl.provision(principal, provisionBody);
    expect(view.status).toBe("active");
    expect(view.hasCredential).toBe(true);
    expect((view as Record<string, unknown>).credentialHash).toBeUndefined();
    expect(await ctrl.getById(principal, view.id)).toMatchObject({ personId: ADA });
    expect(await ctrl.list(principal)).toHaveLength(1);
    expect(await ctrl.listByPerson(principal, ADA)).toHaveLength(1);
  });

  it("manages identifiers and drives lifecycle including lock/unlock", async () => {
    const ctrl = controller();
    const view = await ctrl.provision(principal, provisionBody);

    const withUsername = await ctrl.addIdentifier(principal, view.id, {
      type: "username",
      value: "ada",
    });
    expect(withUsername.identifiers).toHaveLength(2);
    const withoutUsername = await ctrl.removeIdentifier(principal, view.id, {
      type: "username",
      value: "ada",
    });
    expect(withoutUsername.identifiers).toHaveLength(1);

    expect((await ctrl.suspend(principal, view.id)).status).toBe("suspended");
    expect((await ctrl.activate(principal, view.id)).status).toBe("active");
    expect(
      (await ctrl.lock(principal, view.id, { until: "2999-01-01T00:00:00.000Z" })).status,
    ).toBe("locked");
    expect((await ctrl.unlock(principal, view.id)).status).toBe("active");
  });

  it("rejects an invalid body and requires a tenant", async () => {
    const ctrl = controller();
    await expect(
      ctrl.provision(principal, { personId: "not-a-uuid", identifiers: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(ctrl.list(noTenant)).rejects.toBeInstanceOf(ValidationError);
  });
});
