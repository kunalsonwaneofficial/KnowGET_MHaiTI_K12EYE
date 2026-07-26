import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateMemberForPersonError,
  DuplicateMembershipNumberError,
  MemberNotFoundError,
  OrganizationNotFoundForLibraryError,
  PersonNotFoundForLibraryError,
} from "./errors";
import {
  expireMember,
  type LibraryMember,
  type RegisterMemberParams,
  registerMember,
  reinstateMember,
  setMemberCategory,
  setMemberExpiry,
  suspendMember,
} from "./library-member";
import type { LibraryMemberRepository, OrganizationDirectory, PersonDirectory } from "./ports";
import {
  memberExpired,
  memberRegistered,
  memberReinstated,
  memberSuspended,
} from "./library-events";
import type { MemberCategory } from "./library-value";

export interface LibraryMemberServiceDeps {
  readonly repository: LibraryMemberRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for library members. Registers a member against a validated Person and organization
 * (enforcing a unique membership number and one membership per person per organization), edits its
 * category/expiry, and drives the `active ↔ suspended → expired` lifecycle, publishing the member events.
 */
export class LibraryMemberService {
  private readonly repository: LibraryMemberRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LibraryMemberServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async register(input: RegisterMemberParams): Promise<LibraryMember> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForLibraryError(input.organizationId);
    }
    if (!(await this.persons.exists(input.tenantId, input.personId))) {
      throw new PersonNotFoundForLibraryError(input.personId);
    }
    if (
      await this.repository.findByMembershipNumber(input.tenantId, input.membershipNumber.trim())
    ) {
      throw new DuplicateMembershipNumberError(input.membershipNumber.trim());
    }
    if (
      await this.repository.findByPersonAndOrganization(
        input.tenantId,
        input.personId,
        input.organizationId,
      )
    ) {
      throw new DuplicateMemberForPersonError(input.personId, input.organizationId);
    }
    const member = registerMember(input);
    await this.repository.save(member);
    await this.emit(memberRegistered(member));
    return member;
  }

  async setCategory(
    tenantId: TenantId,
    id: Uuid,
    category: MemberCategory,
  ): Promise<LibraryMember> {
    return this.mutate(tenantId, id, (m) => setMemberCategory(m, category));
  }

  async setExpiry(tenantId: TenantId, id: Uuid, expiresOn: string | null): Promise<LibraryMember> {
    return this.mutate(tenantId, id, (m) => setMemberExpiry(m, expiresOn));
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<LibraryMember> {
    const updated = suspendMember(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(memberSuspended(updated));
    return updated;
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<LibraryMember> {
    const updated = reinstateMember(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(memberReinstated(updated));
    return updated;
  }

  async expire(tenantId: TenantId, id: Uuid): Promise<LibraryMember> {
    const updated = expireMember(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(memberExpired(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LibraryMember> {
    return this.require(tenantId, id);
  }

  async getByMembershipNumber(
    tenantId: TenantId,
    membershipNumber: string,
  ): Promise<LibraryMember> {
    const member = await this.repository.findByMembershipNumber(tenantId, membershipNumber);
    if (!member) {
      throw new MemberNotFoundError(membershipNumber);
    }
    return member;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LibraryMember[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (member: LibraryMember) => LibraryMember,
  ): Promise<LibraryMember> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<LibraryMember> {
    const member = await this.repository.findById(tenantId, id);
    if (!member) {
      throw new MemberNotFoundError(id);
    }
    return member;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
