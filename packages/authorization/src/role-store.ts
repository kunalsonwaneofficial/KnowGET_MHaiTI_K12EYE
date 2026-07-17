import type { Role } from "./model";

/** Lookup of roles by name. */
export interface RoleStore {
  getRole(name: string): Role | undefined;
}

export class InMemoryRoleStore implements RoleStore {
  private readonly roles = new Map<string, Role>();

  constructor(roles: readonly Role[] = []) {
    for (const role of roles) {
      this.roles.set(role.name, role);
    }
  }

  getRole(name: string): Role | undefined {
    return this.roles.get(name);
  }

  setRole(role: Role): void {
    this.roles.set(role.name, role);
  }
}
