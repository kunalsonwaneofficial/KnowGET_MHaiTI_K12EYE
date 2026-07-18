import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateMembershipError,
  MembershipNotFoundError,
  OrganizationNotFoundForMembershipError,
  PersonNotFoundForMembershipError,
  UnknownRoleError,
} from "./errors";
import {
  changeMembershipRoles,
  type CreateMembershipParams,
  createMembership,
  endMembership,
  isActiveMembership,
  type Membership,
  reinstateMembership,
  suspendMembership,
} from "./membership";
import {
  membershipEnded,
  membershipGranted,
  membershipReinstated,
  membershipRolesChanged,
  membershipSuspended,
} from "./membership-events";
import type {
  MembershipRepository,
  OrganizationDirectory,
  PersonDirectory,
  RoleDirectory,
} from "./ports";

export interface MembershipServiceDeps {
  readonly repository: MembershipRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  /** When supplied, role names are validated against the tenant's catalogue. */
  readonly roles?: RoleDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the membership domain. Grants people roles within an
 * organization (validating both exist in the tenant and enforcing one active
 * membership per person per organization), maintains the granted roles, and
 * drives the membership lifecycle — publishing a domain event per state change.
 * Persistence- and transport-agnostic.
 */
export class MembershipService {
  private readonly repository: MembershipRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly roles: RoleDirectory | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: MembershipServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.roles = deps.roles;
    this.events = deps.events;
  }

  async grant(input: CreateMembershipParams): Promise<Membership> {
    if (!(await this.persons.exists(input.tenantId, input.personId))) {
      throw new PersonNotFoundForMembershipError(input.personId);
    }
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForMembershipError(input.organizationId);
    }
    await this.assertRolesExist(input.tenantId, input.roles);
    const existing = await this.repository.findActiveByPersonAndOrg(
      input.tenantId,
      input.personId,
      input.organizationId,
    );
    if (existing) {
      throw new DuplicateMembershipError(input.personId, input.organizationId);
    }
    const membership = createMembership(input);
    await this.repository.save(membership);
    await this.emit(membershipGranted(membership));
    return membership;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Membership> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Membership[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listByPerson(tenantId: TenantId, personId: Uuid): Promise<Membership[]> {
    return this.repository.findByPerson(tenantId, personId);
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Membership[]> {
    return this.repository.findByOrganization(tenantId, organizationId);
  }

  async changeRoles(tenantId: TenantId, id: Uuid, roles: readonly string[]): Promise<Membership> {
    const membership = await this.require(tenantId, id);
    await this.assertRolesExist(tenantId, roles);
    const updated = changeMembershipRoles(membership, roles);
    await this.repository.save(updated);
    await this.emit(membershipRolesChanged(updated));
    return updated;
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Membership> {
    const updated = suspendMembership(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(membershipSuspended(updated));
    return updated;
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<Membership> {
    const updated = reinstateMembership(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(membershipReinstated(updated));
    return updated;
  }

  async end(tenantId: TenantId, id: Uuid, endDate?: string | null): Promise<Membership> {
    const updated = endMembership(await this.require(tenantId, id), endDate);
    await this.repository.save(updated);
    await this.emit(membershipEnded(updated));
    return updated;
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  /**
   * The distinct role names a person currently holds (union across their active
   * memberships). This is what a persisted principal resolver expands into a
   * Principal's roles.
   */
  async activeRoleNamesForPerson(tenantId: TenantId, personId: Uuid): Promise<string[]> {
    const memberships = await this.repository.findByPerson(tenantId, personId);
    const roles = new Set<string>();
    for (const membership of memberships) {
      if (isActiveMembership(membership)) {
        for (const role of membership.roles) {
          roles.add(role);
        }
      }
    }
    return [...roles];
  }

  /** Validate role names against the tenant's role catalogue, when one is wired. */
  private async assertRolesExist(tenantId: TenantId, roles: readonly string[]): Promise<void> {
    if (!this.roles) {
      return;
    }
    for (const role of roles) {
      const name = role.trim();
      if (name.length > 0 && !(await this.roles.roleExists(tenantId, name))) {
        throw new UnknownRoleError(name);
      }
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Membership> {
    const membership = await this.repository.findById(tenantId, id);
    if (!membership) {
      throw new MembershipNotFoundError(id);
    }
    return membership;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
