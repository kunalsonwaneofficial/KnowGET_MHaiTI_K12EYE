/**
 * Permissions are opaque action strings (e.g. `student.read`, `fees.write`, or
 * the wildcard `*`) — the same vocabulary the authorization engine checks. A
 * role's permission set is normalized (trimmed, de-duplicated); an empty set is
 * valid (a role that currently grants nothing).
 */
export function normalizePermissions(permissions: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const permission of permissions) {
    const trimmed = permission.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
