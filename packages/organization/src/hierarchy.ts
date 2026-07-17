import type { Uuid } from "@knowget/types";
import type { Organization } from "./organization";

/** A node in the organization tree. */
export interface OrganizationNode {
  readonly organization: Organization;
  readonly children: OrganizationNode[];
}

const childrenByParent = (
  organizations: readonly Organization[],
): Map<string | null, Organization[]> => {
  const map = new Map<string | null, Organization[]>();
  for (const organization of organizations) {
    const key = organization.parentId;
    const list = map.get(key) ?? [];
    list.push(organization);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  }
  return map;
};

/**
 * Build the forest of organization trees from a flat list. Roots are nodes with
 * no parent, or whose parent is not present in the list (e.g. a filtered
 * subtree). Children are ordered by `code` for determinism.
 */
export function buildTree(organizations: readonly Organization[]): OrganizationNode[] {
  const byParent = childrenByParent(organizations);
  const ids = new Set(organizations.map((o) => o.id));

  const build = (organization: Organization): OrganizationNode => ({
    organization,
    children: (byParent.get(organization.id) ?? []).map(build),
  });

  return organizations
    .filter((o) => o.parentId === null || !ids.has(o.parentId))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map(build);
}

/** All descendant ids of `id` (excluding `id` itself). */
export function descendantIds(organizations: readonly Organization[], id: Uuid): Set<Uuid> {
  const byParent = childrenByParent(organizations);
  const result = new Set<Uuid>();
  const stack: Uuid[] = [id];
  while (stack.length > 0) {
    const current = stack.pop() as Uuid;
    for (const child of byParent.get(current) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return result;
}

/** Ancestor ids of `id`, nearest parent first, up to the root. */
export function ancestorIds(organizations: readonly Organization[], id: Uuid): Uuid[] {
  const byId = new Map(organizations.map((o) => [o.id, o]));
  const chain: Uuid[] = [];
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null) {
    chain.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return chain;
}

/**
 * True if making `newParentId` the parent of `id` would create a cycle — i.e.
 * the new parent is the node itself or one of its descendants.
 */
export function wouldCreateCycle(
  organizations: readonly Organization[],
  id: Uuid,
  newParentId: Uuid,
): boolean {
  return newParentId === id || descendantIds(organizations, id).has(newParentId);
}
