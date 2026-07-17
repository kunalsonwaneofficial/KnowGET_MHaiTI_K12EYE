import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { InvalidStatusTransitionError } from "./errors";
import { ancestorIds, buildTree, descendantIds, wouldCreateCycle } from "./hierarchy";
import {
  activateOrganization,
  archiveOrganization,
  createOrganization,
  type Organization,
  renameOrganization,
  suspendOrganization,
  transitionStatus,
} from "./organization";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;

function org(id: string, code: string, parentId: string | null): Organization {
  return {
    id: id as Uuid,
    tenantId: TENANT,
    parentId: parentId as Uuid | null,
    type: "department",
    name: code,
    code,
    status: "active",
    createdAt: "2026-07-17T00:00:00.000Z" as never,
    updatedAt: "2026-07-17T00:00:00.000Z" as never,
  };
}

describe("createOrganization", () => {
  it("creates a draft organization", () => {
    const created = createOrganization({
      tenantId: TENANT,
      type: "school",
      name: "Central",
      code: "CEN",
    });
    expect(created.status).toBe("draft");
    expect(created.parentId).toBeNull();
    expect(created.code).toBe("CEN");
  });
});

describe("status state machine", () => {
  it("allows draft → active → suspended → active → archived", () => {
    const draft = createOrganization({ tenantId: TENANT, type: "school", name: "S", code: "S" });
    const active = activateOrganization(draft);
    expect(active.status).toBe("active");
    const suspended = suspendOrganization(active);
    expect(suspended.status).toBe("suspended");
    expect(activateOrganization(suspended).status).toBe("active");
    expect(archiveOrganization(active).status).toBe("archived");
  });

  it("rejects invalid transitions and treats archived as terminal", () => {
    const draft = createOrganization({ tenantId: TENANT, type: "school", name: "S", code: "S" });
    expect(() => suspendOrganization(draft)).toThrow(InvalidStatusTransitionError);
    const archived = archiveOrganization(draft);
    expect(() => transitionStatus(archived, "active")).toThrow(InvalidStatusTransitionError);
  });

  it("renames without changing identity", () => {
    const created = createOrganization({
      tenantId: TENANT,
      type: "school",
      name: "Old",
      code: "S",
    });
    const renamed = renameOrganization(created, "New");
    expect(renamed.name).toBe("New");
    expect(renamed.id).toBe(created.id);
  });
});

describe("hierarchy", () => {
  // root → a → b ; root → c
  const orgs = [
    org("root", "root", null),
    org("a", "a", "root"),
    org("b", "b", "a"),
    org("c", "c", "root"),
  ];

  it("builds an ordered tree", () => {
    const tree = buildTree(orgs);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.organization.id).toBe("root");
    expect(tree[0]?.children.map((n) => n.organization.code)).toEqual(["a", "c"]);
    expect(tree[0]?.children[0]?.children[0]?.organization.id).toBe("b");
  });

  it("computes descendants and ancestors", () => {
    expect([...descendantIds(orgs, "root" as Uuid)].sort()).toEqual(["a", "b", "c"]);
    expect(ancestorIds(orgs, "b" as Uuid)).toEqual(["a", "root"]);
  });

  it("detects cycles", () => {
    expect(wouldCreateCycle(orgs, "root" as Uuid, "root" as Uuid)).toBe(true); // self
    expect(wouldCreateCycle(orgs, "root" as Uuid, "b" as Uuid)).toBe(true); // descendant
    expect(wouldCreateCycle(orgs, "a" as Uuid, "c" as Uuid)).toBe(false); // sibling subtree
  });

  it("treats nodes with an absent parent as roots", () => {
    const subtree = [org("a", "a", "root"), org("b", "b", "a")]; // root not in set
    expect(buildTree(subtree).map((n) => n.organization.id)).toEqual(["a"]);
  });
});
