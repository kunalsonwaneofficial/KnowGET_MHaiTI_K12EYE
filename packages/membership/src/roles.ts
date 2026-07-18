import { MembershipRolesRequiredError } from "./errors";

/**
 * The role names a membership grants (e.g. `teacher`, `principal`, `student`).
 * Role names are opaque strings here; the tenant-scoped role catalogue and the
 * role→permission mapping are engineered in P2-D01-M05 (Authorization). The
 * membership only records *which* roles a person plays in an organization.
 */
export function normalizeRoles(roles: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const role of roles) {
    const trimmed = role.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  if (normalized.length === 0) {
    throw new MembershipRolesRequiredError();
  }
  return normalized;
}
