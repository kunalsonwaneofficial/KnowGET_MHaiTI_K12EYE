import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { AuthorityScope } from "./authority-scope";
import {
  authorizesAmount,
  type Delegation,
  type GrantDelegationParams,
  grantDelegation,
  isEffectiveOn,
  revokeDelegation,
} from "./delegation";
import {
  DelegationNotFoundError,
  OrganizationNotFoundForGovernanceError,
  PersonNotFoundForGovernanceError,
} from "./errors";
import { delegationGranted, delegationRevoked } from "./governance-events";
import type { DelegationRepository, OrganizationDirectory, PersonDirectory } from "./ports";

export interface DelegationServiceDeps {
  readonly repository: DelegationRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/** A date-only ISO string (YYYY-MM-DD) for effective-window checks. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Application service for delegations of authority. Grants and revokes delegated
 * powers (validating organization, delegator and delegate), and answers the
 * approval-matrix questions: which delegations are effective for an organization,
 * and whether a person is authorized to approve an amount under a scope — publishing
 * `governance.delegation.granted` / `.revoked` as the audit trail.
 */
export class DelegationService {
  private readonly repository: DelegationRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DelegationServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async grant(input: GrantDelegationParams): Promise<Delegation> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.delegatorId);
    await this.assertPersonExists(input.tenantId, input.delegateId);
    const delegation = grantDelegation(input);
    await this.repository.save(delegation);
    await this.emit(delegationGranted(delegation));
    return delegation;
  }

  async revoke(
    tenantId: TenantId,
    id: Uuid,
    options?: { reason?: string | null; revokedOn?: string | null },
  ): Promise<Delegation> {
    const updated = revokeDelegation(await this.require(tenantId, id), options);
    await this.repository.save(updated);
    await this.emit(delegationRevoked(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Delegation> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Delegation[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForDelegate(tenantId: TenantId, delegateId: Uuid): Promise<Delegation[]> {
    return this.repository.listByDelegate(tenantId, delegateId);
  }

  /**
   * The approval matrix for an organization: the currently-effective delegations,
   * optionally narrowed to a single authority scope.
   */
  async approvalMatrix(
    tenantId: TenantId,
    organizationId: Uuid,
    scope?: AuthorityScope,
    on: string = today(),
  ): Promise<Delegation[]> {
    const delegations = await this.repository.listByOrganization(tenantId, organizationId);
    return delegations.filter(
      (d) => isEffectiveOn(d, on) && (scope === undefined || d.scope === scope),
    );
  }

  /** Whether a person holds an effective delegation authorizing an amount under a scope. */
  async authorizes(
    tenantId: TenantId,
    organizationId: Uuid,
    delegateId: Uuid,
    scope: AuthorityScope,
    amount: number,
    on: string = today(),
  ): Promise<boolean> {
    const delegations = await this.repository.listByOrganization(tenantId, organizationId);
    return delegations.some(
      (d) => d.delegateId === delegateId && d.scope === scope && authorizesAmount(d, amount, on),
    );
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGovernanceError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForGovernanceError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Delegation> {
    const delegation = await this.repository.findById(tenantId, id);
    if (!delegation) {
      throw new DelegationNotFoundError(id);
    }
    return delegation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
