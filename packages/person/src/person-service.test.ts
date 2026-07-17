import type { DomainEvent, TenantId } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CannotMergePersonError, DuplicatePersonError, PersonNotFoundError } from "./errors";
import { InMemoryPersonRepository } from "./person-repository";
import { PersonService } from "./person-service";

const TENANT_A = "11111111-1111-1111-1111-111111111111" as TenantId;
const TENANT_B = "22222222-2222-2222-2222-222222222222" as TenantId;
const NAME = { given: "Ada", family: "Lovelace" };

function setup(): { service: PersonService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const service = new PersonService(new InMemoryPersonRepository(), {
    publish: async (event) => {
      events.push(event);
    },
  });
  return { service, events };
}

describe("PersonService.register", () => {
  it("registers an active person and publishes an event", async () => {
    const { service, events } = setup();
    const person = await service.register({
      tenantId: TENANT_A,
      name: NAME,
      dateOfBirth: "1815-12-10",
    });
    expect(person.status).toBe("active");
    expect(events.map((e) => e.type)).toEqual(["person.registered"]);
    expect(events[0]?.metadata.tenantId).toBe(TENANT_A);
  });

  it("blocks a likely duplicate but allows it with allowDuplicate", async () => {
    const { service } = setup();
    await service.register({ tenantId: TENANT_A, name: NAME, dateOfBirth: "1815-12-10" });
    await expect(
      service.register({ tenantId: TENANT_A, name: NAME, dateOfBirth: "1815-12-10" }),
    ).rejects.toBeInstanceOf(DuplicatePersonError);
    await expect(
      service.register({
        tenantId: TENANT_A,
        name: NAME,
        dateOfBirth: "1815-12-10",
        allowDuplicate: true,
      }),
    ).resolves.toBeDefined();
  });

  it("isolates match keys by tenant", async () => {
    const { service } = setup();
    await service.register({ tenantId: TENANT_A, name: NAME, dateOfBirth: "1815-12-10" });
    await expect(
      service.register({ tenantId: TENANT_B, name: NAME, dateOfBirth: "1815-12-10" }),
    ).resolves.toBeDefined();
  });
});

describe("PersonService contacts & lifecycle", () => {
  it("adds contacts and changes status with events", async () => {
    const { service, events } = setup();
    const person = await service.register({ tenantId: TENANT_A, name: NAME });
    await service.addContact(TENANT_A, person.id, { type: "email", value: "ada@x.com" });
    const withDup = await service.addContact(TENANT_A, person.id, {
      type: "email",
      value: "ADA@x.com",
    });
    expect(withDup.contacts).toHaveLength(1); // de-duplicated
    await service.changeStatus(TENANT_A, person.id, "inactive");
    expect(events.map((e) => e.type)).toContain("person.contact_added");
    expect(events.find((e) => e.type === "person.status_changed")?.payload).toMatchObject({
      from: "active",
      to: "inactive",
    });
  });
});

describe("PersonService.merge", () => {
  it("merges a duplicate into the survivor, absorbing contacts", async () => {
    const { service, events } = setup();
    const survivor = await service.register({ tenantId: TENANT_A, name: NAME });
    await service.addContact(TENANT_A, survivor.id, { type: "email", value: "survivor@x.com" });
    const dup = await service.register({
      tenantId: TENANT_A,
      name: NAME,
      allowDuplicate: true,
    });
    await service.addContact(TENANT_A, dup.id, { type: "phone", value: "555" });

    const merged = await service.merge(TENANT_A, survivor.id, dup.id);
    expect(merged.contacts).toHaveLength(2); // absorbed the phone
    expect((await service.getById(TENANT_A, dup.id)).status).toBe("merged");
    expect((await service.getById(TENANT_A, dup.id)).mergedInto).toBe(survivor.id);
    expect(events.map((e) => e.type)).toContain("person.merged");
  });

  it("refuses to merge a person into itself or a merged record", async () => {
    const { service } = setup();
    const a = await service.register({ tenantId: TENANT_A, name: NAME });
    await expect(service.merge(TENANT_A, a.id, a.id)).rejects.toBeInstanceOf(
      CannotMergePersonError,
    );
  });
});

describe("PersonService tenant isolation", () => {
  it("does not expose another tenant's person", async () => {
    const { service } = setup();
    const person = await service.register({ tenantId: TENANT_A, name: NAME });
    await expect(service.getById(TENANT_B, person.id)).rejects.toBeInstanceOf(PersonNotFoundError);
  });
});
