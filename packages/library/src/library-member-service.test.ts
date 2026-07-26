import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { LibraryMemberService } from "./library-member-service";
import {
  InMemoryLibraryMemberRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const personId = "44444444-4444-4444-4444-444444444444" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});
const personDir = (known = true): PersonDirectory => ({
  async exists() {
    return known;
  },
});

const setup = (orgKnown = true, personKnown = true) => {
  const repository = new InMemoryLibraryMemberRepository();
  const service = new LibraryMemberService({
    repository,
    organizations: orgDir(orgKnown),
    persons: personDir(personKnown),
  });
  return { repository, service };
};

const input = {
  tenantId,
  organizationId,
  personId,
  membershipNumber: "M-1",
  category: "student" as const,
  joinedOn: "2026-01-01",
};

describe("LibraryMemberService.register", () => {
  it("registers a member when org and person exist", async () => {
    const { service } = setup();
    expect((await service.register(input)).status).toBe("active");
  });

  it("rejects an unknown org or person", async () => {
    await expect(setup(false).service.register(input)).rejects.toThrow(/Organization/);
    await expect(setup(true, false).service.register(input)).rejects.toThrow(/Person/);
  });

  it("rejects a duplicate membership number and a second membership for the same person+org", async () => {
    const { service } = setup();
    await service.register(input);
    await expect(service.register({ ...input, personId: "other" as Uuid })).rejects.toThrow(
      /Membership number/,
    );
    await expect(service.register({ ...input, membershipNumber: "M-2" })).rejects.toThrow(
      /already a library member/,
    );
  });
});

describe("LibraryMemberService lifecycle", () => {
  it("suspends, reinstates and expires", async () => {
    const { service } = setup();
    const m = await service.register(input);
    expect((await service.suspend(tenantId, m.id)).status).toBe("suspended");
    expect((await service.reinstate(tenantId, m.id)).status).toBe("active");
    expect((await service.expire(tenantId, m.id)).status).toBe("expired");
  });
});
