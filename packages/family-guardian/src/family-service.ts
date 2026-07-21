import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateFamilyNumberError,
  FamilyNotFoundError,
  HouseholdMemberNotFoundError,
  OrganizationNotFoundForFamilyError,
  PersonNotFoundForFamilyError,
} from "./errors";
import type { FamilyAddress } from "./family-address";
import {
  addMember,
  archiveFamily,
  type Family,
  markMerged,
  markSplit,
  type PreferredCommunicationPatch,
  putAddress,
  type RegisterFamilyParams,
  registerFamily,
  removeAddress,
  removeMember,
  renameFamily,
  setMemberRole,
  setPrimaryContact,
  setPreferredCommunication,
} from "./family";
import { familyRegistered } from "./family-guardian-events";
import type { HouseholdMember, HouseholdRole } from "./household-member";
import type { FamilyRepository, OrganizationDirectory, PersonDirectory } from "./ports";

export interface FamilyServiceDeps {
  readonly repository: FamilyRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface SplitFamilyParams {
  readonly newFamilyNumber: string;
  readonly name: string;
  readonly memberPersonIds: readonly Uuid[];
}

export interface SplitFamilyResult {
  readonly source: Family;
  readonly created: Family;
}

/**
 * Application service for family units. Registers households (validating the
 * organization and every member Person, enforcing a unique family number), manages
 * membership, addresses, the primary contact and communication defaults, and drives
 * the lifecycle — including **merging** households into one and **splitting** a
 * household into new ones. Publishes {@link familyRegistered}. Independent of Student.
 */
export class FamilyService {
  private readonly repository: FamilyRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: FamilyServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async register(input: RegisterFamilyParams): Promise<Family> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    for (const member of input.members ?? []) {
      await this.assertPersonExists(input.tenantId, member.personId);
    }
    await this.assertFamilyNumberFree(input.tenantId, input.familyNumber.trim());
    const family = registerFamily(input);
    await this.repository.save(family);
    await this.emit(familyRegistered(family));
    return family;
  }

  async addMember(tenantId: TenantId, id: Uuid, member: HouseholdMember): Promise<Family> {
    await this.assertPersonExists(tenantId, member.personId);
    return this.mutate(tenantId, id, (f) => addMember(f, member));
  }

  async removeMember(tenantId: TenantId, id: Uuid, personId: Uuid): Promise<Family> {
    return this.mutate(tenantId, id, (f) => removeMember(f, personId));
  }

  async setMemberRole(
    tenantId: TenantId,
    id: Uuid,
    personId: Uuid,
    role: HouseholdRole,
  ): Promise<Family> {
    return this.mutate(tenantId, id, (f) => setMemberRole(f, personId, role));
  }

  async setPrimaryContact(tenantId: TenantId, id: Uuid, personId: Uuid): Promise<Family> {
    return this.mutate(tenantId, id, (f) => setPrimaryContact(f, personId));
  }

  async putAddress(tenantId: TenantId, id: Uuid, address: FamilyAddress): Promise<Family> {
    return this.mutate(tenantId, id, (f) => putAddress(f, address));
  }

  async removeAddress(tenantId: TenantId, id: Uuid, label: string): Promise<Family> {
    return this.mutate(tenantId, id, (f) => removeAddress(f, label));
  }

  async setPreferredCommunication(
    tenantId: TenantId,
    id: Uuid,
    patch: PreferredCommunicationPatch,
  ): Promise<Family> {
    return this.mutate(tenantId, id, (f) => setPreferredCommunication(f, patch));
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Family> {
    return this.mutate(tenantId, id, (f) => renameFamily(f, name));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Family> {
    return this.mutate(tenantId, id, archiveFamily);
  }

  /** Merge the source household into the target: fold members and addresses, then close the source. */
  async merge(tenantId: TenantId, sourceId: Uuid, targetId: Uuid): Promise<Family> {
    const source = await this.require(tenantId, sourceId);
    const target = await this.require(tenantId, targetId);
    let merged = target;
    for (const member of source.members) {
      if (!merged.members.some((m) => m.personId === member.personId)) {
        merged = addMember(merged, member);
      }
    }
    for (const address of source.addresses) {
      if (!merged.addresses.some((a) => a.label === address.label)) {
        merged = putAddress(merged, address);
      }
    }
    await this.repository.save(merged);
    await this.repository.save(markMerged(source, target.id));
    return merged;
  }

  /** Split a subset of members off into a new household; if the source empties, it is marked split. */
  async split(
    tenantId: TenantId,
    sourceId: Uuid,
    params: SplitFamilyParams,
  ): Promise<SplitFamilyResult> {
    const source = await this.require(tenantId, sourceId);
    await this.assertFamilyNumberFree(tenantId, params.newFamilyNumber.trim());
    const ids = [...new Set(params.memberPersonIds)];
    const movedMembers = ids.map((personId) => {
      const member = source.members.find((m) => m.personId === personId);
      if (!member) {
        throw new HouseholdMemberNotFoundError(personId);
      }
      return member;
    });
    let created = registerFamily({
      tenantId,
      organizationId: source.organizationId,
      familyNumber: params.newFamilyNumber,
      name: params.name,
      members: movedMembers,
    });
    if (source.primaryContactPersonId && ids.includes(source.primaryContactPersonId)) {
      created = setPrimaryContact(created, source.primaryContactPersonId);
    }
    let updatedSource = source;
    for (const personId of ids) {
      updatedSource = removeMember(updatedSource, personId);
    }
    if (updatedSource.members.length === 0) {
      updatedSource = markSplit(updatedSource);
    }
    await this.repository.save(updatedSource);
    await this.repository.save(created);
    return { source: updatedSource, created };
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Family> {
    return this.require(tenantId, id);
  }

  async getByFamilyNumber(tenantId: TenantId, familyNumber: string): Promise<Family> {
    const family = await this.repository.findByFamilyNumber(tenantId, familyNumber);
    if (!family) {
      throw new FamilyNotFoundError(familyNumber);
    }
    return family;
  }

  async list(tenantId: TenantId): Promise<Family[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Family[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (family: Family) => Family,
  ): Promise<Family> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForFamilyError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForFamilyError(personId);
    }
  }

  private async assertFamilyNumberFree(tenantId: TenantId, familyNumber: string): Promise<void> {
    if (await this.repository.findByFamilyNumber(tenantId, familyNumber)) {
      throw new DuplicateFamilyNumberError(familyNumber);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Family> {
    const family = await this.repository.findById(tenantId, id);
    if (!family) {
      throw new FamilyNotFoundError(id);
    }
    return family;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
