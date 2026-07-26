import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AccessCredential,
  grantCredentialZone,
  type IssueCredentialParams,
  issueCredential,
  reinstateCredential,
  revokeCredential,
  revokeCredentialZone,
  setCredentialExpiry,
  suspendCredential,
} from "./access-credential";
import type { CredentialHolderType } from "./campus-security-value";
import {
  credentialExpirySet,
  credentialIssued,
  credentialReinstated,
  credentialRevoked,
  credentialSuspended,
  credentialZoneGranted,
  credentialZoneRevoked,
} from "./campus-security-events";
import {
  AccessCredentialNotFoundError,
  AccessZoneNotFoundError,
  DuplicateCredentialNumberError,
  EmployeeNotFoundForSecurityError,
  OrganizationNotFoundForSecurityError,
  PersonNotFoundForSecurityError,
  VisitorNotFoundError,
} from "./errors";
import type {
  AccessCredentialRepository,
  AccessZoneRepository,
  EmployeeDirectory,
  OrganizationDirectory,
  PersonDirectory,
  VisitorRepository,
} from "./ports";

export interface AccessCredentialServiceDeps {
  readonly repository: AccessCredentialRepository;
  readonly organizations: OrganizationDirectory;
  readonly zones: AccessZoneRepository;
  readonly employees: EmployeeDirectory;
  readonly persons: PersonDirectory;
  readonly visitors: VisitorRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for access credentials. Issues a credential (validating the holder — an Employee, a
 * Person or a Visitor — a unique credential number, and that every granted zone exists), grants and revokes
 * zone access, sets expiry, and drives the `active ↔ suspended → revoked` lifecycle, publishing the
 * credential events.
 */
export class AccessCredentialService {
  private readonly repository: AccessCredentialRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly zones: AccessZoneRepository;
  private readonly employees: EmployeeDirectory;
  private readonly persons: PersonDirectory;
  private readonly visitors: VisitorRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AccessCredentialServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.zones = deps.zones;
    this.employees = deps.employees;
    this.persons = deps.persons;
    this.visitors = deps.visitors;
    this.events = deps.events;
  }

  async issue(input: IssueCredentialParams): Promise<AccessCredential> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSecurityError(input.organizationId);
    }
    await this.requireHolder(input.tenantId, input.holderType, input.holderId);
    for (const zoneId of input.grantedZoneIds ?? []) {
      await this.requireZone(input.tenantId, zoneId);
    }
    if (await this.repository.findByNumber(input.tenantId, input.credentialNumber.trim())) {
      throw new DuplicateCredentialNumberError(input.credentialNumber.trim());
    }
    const credential = issueCredential(input);
    await this.repository.save(credential);
    await this.emit(credentialIssued(credential));
    return credential;
  }

  async grantZone(tenantId: TenantId, id: Uuid, zoneId: Uuid): Promise<AccessCredential> {
    await this.requireZone(tenantId, zoneId);
    const updated = grantCredentialZone(await this.require(tenantId, id), zoneId);
    await this.repository.save(updated);
    await this.emit(credentialZoneGranted(updated));
    return updated;
  }

  async revokeZoneGrant(tenantId: TenantId, id: Uuid, zoneId: Uuid): Promise<AccessCredential> {
    const updated = revokeCredentialZone(await this.require(tenantId, id), zoneId);
    await this.repository.save(updated);
    await this.emit(credentialZoneRevoked(updated));
    return updated;
  }

  async setExpiry(
    tenantId: TenantId,
    id: Uuid,
    expiresOn: string | null,
  ): Promise<AccessCredential> {
    const updated = setCredentialExpiry(await this.require(tenantId, id), expiresOn);
    await this.repository.save(updated);
    await this.emit(credentialExpirySet(updated));
    return updated;
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<AccessCredential> {
    const updated = suspendCredential(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(credentialSuspended(updated));
    return updated;
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<AccessCredential> {
    const updated = reinstateCredential(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(credentialReinstated(updated));
    return updated;
  }

  async revoke(tenantId: TenantId, id: Uuid): Promise<AccessCredential> {
    const updated = revokeCredential(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(credentialRevoked(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AccessCredential> {
    return this.require(tenantId, id);
  }

  async getByNumber(tenantId: TenantId, credentialNumber: string): Promise<AccessCredential> {
    const credential = await this.repository.findByNumber(tenantId, credentialNumber);
    if (!credential) {
      throw new AccessCredentialNotFoundError(credentialNumber);
    }
    return credential;
  }

  async listForHolder(
    tenantId: TenantId,
    holderType: CredentialHolderType,
    holderId: Uuid,
  ): Promise<AccessCredential[]> {
    return this.repository.listByHolder(tenantId, holderType, holderId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessCredential[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AccessCredential> {
    const credential = await this.repository.findById(tenantId, id);
    if (!credential) {
      throw new AccessCredentialNotFoundError(id);
    }
    return credential;
  }

  private async requireHolder(
    tenantId: TenantId,
    holderType: CredentialHolderType,
    holderId: Uuid,
  ): Promise<void> {
    if (holderType === "employee") {
      if (!(await this.employees.exists(tenantId, holderId))) {
        throw new EmployeeNotFoundForSecurityError(holderId);
      }
    } else if (holderType === "person") {
      if (!(await this.persons.exists(tenantId, holderId))) {
        throw new PersonNotFoundForSecurityError(holderId);
      }
    } else if (!(await this.visitors.findById(tenantId, holderId))) {
      throw new VisitorNotFoundError(holderId);
    }
  }

  private async requireZone(tenantId: TenantId, zoneId: Uuid): Promise<void> {
    if (!(await this.zones.findById(tenantId, zoneId))) {
      throw new AccessZoneNotFoundError(zoneId);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
