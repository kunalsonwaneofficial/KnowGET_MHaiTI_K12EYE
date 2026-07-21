import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateGuardianError,
  GuardianNotFoundError,
  OrganizationNotFoundForFamilyError,
  PersonNotFoundForFamilyError,
} from "./errors";
import { guardianRegistered } from "./family-guardian-events";
import {
  activateGuardian,
  archiveGuardian,
  type Guardian,
  putContact,
  type RegisterGuardianParams,
  registerGuardian,
  rejectVerification,
  removeContact,
  setAvailability,
  submitForVerification,
  suspendGuardian,
  updateLegalAuthority,
  verifyGuardian,
} from "./guardian";
import type { GuardianContact } from "./guardian-contact";
import type { LegalAuthorityType } from "./legal-authority";
import type { GuardianRepository, OrganizationDirectory, PersonDirectory } from "./ports";

export interface GuardianServiceDeps {
  readonly repository: GuardianRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for guardians. Registers a guardian against a validated
 * organization and Person (at most one guardian per person per organization), drives
 * the identity-verification and lifecycle state machines, and manages legal authority,
 * contacts and availability. Publishes {@link guardianRegistered}.
 */
export class GuardianService {
  private readonly repository: GuardianRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: GuardianServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async register(input: RegisterGuardianParams): Promise<Guardian> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.personId);
    await this.assertNotAlreadyGuardian(input.tenantId, input.personId, input.organizationId);
    const guardian = registerGuardian(input);
    await this.repository.save(guardian);
    await this.emit(guardianRegistered(guardian));
    return guardian;
  }

  async submitForVerification(tenantId: TenantId, id: Uuid): Promise<Guardian> {
    return this.mutate(tenantId, id, submitForVerification);
  }

  async verify(tenantId: TenantId, id: Uuid, verifiedOn?: string | null): Promise<Guardian> {
    return this.mutate(tenantId, id, (g) => verifyGuardian(g, verifiedOn));
  }

  async rejectVerification(tenantId: TenantId, id: Uuid): Promise<Guardian> {
    return this.mutate(tenantId, id, rejectVerification);
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<Guardian> {
    return this.mutate(tenantId, id, activateGuardian);
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Guardian> {
    return this.mutate(tenantId, id, suspendGuardian);
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Guardian> {
    return this.mutate(tenantId, id, archiveGuardian);
  }

  async updateLegalAuthority(
    tenantId: TenantId,
    id: Uuid,
    authority: LegalAuthorityType,
  ): Promise<Guardian> {
    return this.mutate(tenantId, id, (g) => updateLegalAuthority(g, authority));
  }

  async putContact(tenantId: TenantId, id: Uuid, contact: GuardianContact): Promise<Guardian> {
    return this.mutate(tenantId, id, (g) => putContact(g, contact));
  }

  async removeContact(tenantId: TenantId, id: Uuid, value: string): Promise<Guardian> {
    return this.mutate(tenantId, id, (g) => removeContact(g, value));
  }

  async setAvailability(tenantId: TenantId, id: Uuid, note: string | null): Promise<Guardian> {
    return this.mutate(tenantId, id, (g) => setAvailability(g, note));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Guardian> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Guardian[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Guardian[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForPerson(tenantId: TenantId, personId: Uuid): Promise<Guardian[]> {
    return this.repository.listByPerson(tenantId, personId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (guardian: Guardian) => Guardian,
  ): Promise<Guardian> {
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

  private async assertNotAlreadyGuardian(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<void> {
    if (await this.repository.findByPersonAndOrganization(tenantId, personId, organizationId)) {
      throw new DuplicateGuardianError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Guardian> {
    const guardian = await this.repository.findById(tenantId, id);
    if (!guardian) {
      throw new GuardianNotFoundError(id);
    }
    return guardian;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
