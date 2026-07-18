import { toIso } from "@knowget/shared";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  IdentifierInUseError,
  IdentityAccountNotFoundError,
  PersonNotFoundForIdentityError,
} from "./errors";
import { IdentityAccountService } from "./identity-account-service";
import type { LoginIdentifier } from "./identifier";
import {
  type CredentialHasher,
  InMemoryIdentityAccountRepository,
  type PersonDirectory,
} from "./ports";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as TenantId;
const ADA = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRACE = "33333333-3333-3333-3333-333333333333" as Uuid;
const GHOST = "99999999-9999-9999-9999-999999999999" as Uuid;

const email: LoginIdentifier = { type: "email", value: "ada@school.edu" };

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

const hasher: CredentialHasher = { hash: (plaintext) => `hashed:${plaintext}` };

function build(): { service: IdentityAccountService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const service = new IdentityAccountService({
    repository: new InMemoryIdentityAccountRepository(),
    persons: new FakePersonDirectory([
      [TENANT_A, ADA],
      [TENANT_A, GRACE],
      [TENANT_B, ADA],
    ]),
    hasher,
    events: { publish: async (event: DomainEvent) => void events.push(event) },
  });
  return { service, events };
}

describe("IdentityAccountService — provisioning", () => {
  let service: IdentityAccountService;
  let events: DomainEvent[];
  beforeEach(() => {
    ({ service, events } = build());
  });

  it("provisions a pending account for an existing person and emits an event", async () => {
    const account = await service.provision({
      tenantId: TENANT_A,
      personId: ADA,
      identifiers: [email],
    });
    expect(account.status).toBe("pending");
    expect(account.personId).toBe(ADA);
    expect(events.map((e) => e.type)).toContain("identity_account.provisioned");
  });

  it("can provision-and-activate with a hashed credential", async () => {
    const account = await service.provision({
      tenantId: TENANT_A,
      personId: ADA,
      identifiers: [email],
      password: "s3cret",
      activate: true,
    });
    expect(account.status).toBe("active");
    expect(account.credentialHash).toBe("hashed:s3cret");
    expect(events.map((e) => e.type)).toContain("identity_account.activated");
  });

  it("refuses to provision for a person that does not exist in the tenant", async () => {
    await expect(
      service.provision({ tenantId: TENANT_A, personId: GHOST, identifiers: [email] }),
    ).rejects.toBeInstanceOf(PersonNotFoundForIdentityError);
  });

  it("enforces tenant-wide identifier uniqueness", async () => {
    await service.provision({ tenantId: TENANT_A, personId: ADA, identifiers: [email] });
    await expect(
      service.provision({
        tenantId: TENANT_A,
        personId: GRACE,
        identifiers: [{ type: "email", value: "ADA@school.edu" }],
      }),
    ).rejects.toBeInstanceOf(IdentifierInUseError);
  });

  it("scopes accounts and identifier uniqueness per tenant", async () => {
    const a = await service.provision({ tenantId: TENANT_A, personId: ADA, identifiers: [email] });
    // Same identifier is free in another tenant.
    await expect(
      service.provision({ tenantId: TENANT_B, personId: ADA, identifiers: [email] }),
    ).resolves.toBeDefined();
    // Tenant B cannot see tenant A's account.
    await expect(service.getById(TENANT_B, a.id)).rejects.toBeInstanceOf(
      IdentityAccountNotFoundError,
    );
  });
});

describe("IdentityAccountService — management", () => {
  let service: IdentityAccountService;
  let events: DomainEvent[];
  beforeEach(() => {
    ({ service, events } = build());
  });

  it("lists a person's accounts and manages identifiers", async () => {
    const account = await service.provision({
      tenantId: TENANT_A,
      personId: ADA,
      identifiers: [email],
    });
    expect(await service.listByPerson(TENANT_A, ADA)).toHaveLength(1);

    const withUsername = await service.addIdentifier(TENANT_A, account.id, {
      type: "username",
      value: "ada",
    });
    expect(withUsername.identifiers).toHaveLength(2);

    await expect(
      service.addIdentifier(TENANT_A, account.id, { type: "email", value: "ada@school.edu" }),
    ).rejects.toBeInstanceOf(IdentifierInUseError);

    const withoutUsername = await service.removeIdentifier(TENANT_A, account.id, {
      type: "username",
      value: "ada",
    });
    expect(withoutUsername.identifiers).toHaveLength(1);
  });

  it("sets a credential and drives status through suspend/activate/disable", async () => {
    const account = await service.provision({
      tenantId: TENANT_A,
      personId: ADA,
      identifiers: [email],
      activate: true,
    });
    expect((await service.setCredential(TENANT_A, account.id, "pw")).credentialHash).toBe(
      "hashed:pw",
    );
    expect((await service.suspend(TENANT_A, account.id)).status).toBe("suspended");
    expect((await service.activate(TENANT_A, account.id)).status).toBe("active");
    expect((await service.disable(TENANT_A, account.id)).status).toBe("disabled");
    expect(events.map((e) => e.type)).toContain("identity_account.status_changed");
  });

  it("locks then unlocks an account", async () => {
    const account = await service.provision({
      tenantId: TENANT_A,
      personId: ADA,
      identifiers: [email],
      activate: true,
    });
    const locked = await service.lock(
      TENANT_A,
      account.id,
      toIso(new Date("2999-01-01T00:00:00.000Z")),
    );
    expect(locked.status).toBe("locked");
    expect(events.map((e) => e.type)).toContain("identity_account.locked");

    const unlocked = await service.unlock(TENANT_A, account.id);
    expect(unlocked.status).toBe("active");
    expect(unlocked.lockedUntil).toBeNull();
  });

  it("throws not-found for an unknown account", async () => {
    await expect(service.getById(TENANT_A, GHOST)).rejects.toBeInstanceOf(
      IdentityAccountNotFoundError,
    );
  });
});
