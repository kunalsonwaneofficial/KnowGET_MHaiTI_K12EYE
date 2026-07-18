import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  IdentifierInUseError,
  IdentityAccountNotFoundError,
  PersonNotFoundForIdentityError,
} from "./errors";
import {
  addAccountIdentifier,
  archiveAccount,
  changeCredentialHash,
  disableAccount,
  type IdentityAccount,
  lockAccount,
  provisionIdentityAccount,
  removeAccountIdentifier,
  suspendAccount,
  transitionAccountStatus,
  clearFailedAttempts,
} from "./identity-account";
import {
  identityAccountActivated,
  identityAccountCredentialChanged,
  identityAccountIdentifierAdded,
  identityAccountIdentifierRemoved,
  identityAccountLocked,
  identityAccountProvisioned,
  identityAccountStatusChanged,
} from "./identity-account-events";
import type { LoginIdentifier } from "./identifier";
import type { CredentialHasher, IdentityAccountRepository, PersonDirectory } from "./ports";

export interface ProvisionAccountInput {
  readonly tenantId: TenantId;
  readonly personId: Uuid;
  readonly identifiers: readonly LoginIdentifier[];
  /** Plaintext credential; hashed via the injected {@link CredentialHasher}. */
  readonly password?: string;
  /** Activate immediately instead of leaving the account `pending`. */
  readonly activate?: boolean;
}

export interface IdentityAccountServiceDeps {
  readonly repository: IdentityAccountRepository;
  readonly persons: PersonDirectory;
  readonly hasher: CredentialHasher;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the enterprise identity domain. Provisions
 * tenant-scoped login accounts against real {@link Person} records, enforces
 * tenant-wide identifier uniqueness, hashes credentials at the edge, and drives
 * the account lifecycle — publishing a domain event per state change.
 * Transport- and persistence-agnostic.
 */
export class IdentityAccountService {
  private readonly repository: IdentityAccountRepository;
  private readonly persons: PersonDirectory;
  private readonly hasher: CredentialHasher;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: IdentityAccountServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.hasher = deps.hasher;
    this.events = deps.events;
  }

  async provision(input: ProvisionAccountInput): Promise<IdentityAccount> {
    if (!(await this.persons.exists(input.tenantId, input.personId))) {
      throw new PersonNotFoundForIdentityError(input.personId);
    }
    for (const identifier of input.identifiers) {
      await this.assertIdentifierFree(input.tenantId, identifier);
    }
    let account = provisionIdentityAccount({
      tenantId: input.tenantId,
      personId: input.personId,
      identifiers: input.identifiers,
      ...(input.password !== undefined ? { credentialHash: this.hasher.hash(input.password) } : {}),
    });
    if (input.activate === true) {
      account = transitionAccountStatus(account, "active");
    }
    await this.repository.save(account);
    await this.emit(identityAccountProvisioned(account));
    if (account.status === "active") {
      await this.emit(identityAccountActivated(account));
    }
    return account;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<IdentityAccount> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<IdentityAccount[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listByPerson(tenantId: TenantId, personId: Uuid): Promise<IdentityAccount[]> {
    return this.repository.findByPersonId(tenantId, personId);
  }

  async addIdentifier(
    tenantId: TenantId,
    id: Uuid,
    identifier: LoginIdentifier,
  ): Promise<IdentityAccount> {
    const account = await this.require(tenantId, id);
    await this.assertIdentifierFree(tenantId, identifier);
    const updated = addAccountIdentifier(account, identifier);
    await this.repository.save(updated);
    await this.emit(identityAccountIdentifierAdded(updated, identifier.type));
    return updated;
  }

  async removeIdentifier(
    tenantId: TenantId,
    id: Uuid,
    identifier: LoginIdentifier,
  ): Promise<IdentityAccount> {
    const account = await this.require(tenantId, id);
    const updated = removeAccountIdentifier(account, identifier);
    if (updated !== account) {
      await this.repository.save(updated);
      await this.emit(identityAccountIdentifierRemoved(updated, identifier.type));
    }
    return updated;
  }

  async setCredential(tenantId: TenantId, id: Uuid, password: string): Promise<IdentityAccount> {
    const account = await this.require(tenantId, id);
    const updated = changeCredentialHash(account, this.hasher.hash(password));
    await this.repository.save(updated);
    await this.emit(identityAccountCredentialChanged(updated));
    return updated;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<IdentityAccount> {
    const account = await this.require(tenantId, id);
    const updated = transitionAccountStatus(account, "active");
    await this.repository.save(updated);
    await this.emit(identityAccountActivated(updated));
    return updated;
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<IdentityAccount> {
    return this.changeStatus(tenantId, id, suspendAccount);
  }

  async disable(tenantId: TenantId, id: Uuid): Promise<IdentityAccount> {
    return this.changeStatus(tenantId, id, disableAccount);
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<IdentityAccount> {
    return this.changeStatus(tenantId, id, archiveAccount);
  }

  /** Administratively lock the account until `until` (e.g. pending a review). */
  async lock(tenantId: TenantId, id: Uuid, until: ISODateString): Promise<IdentityAccount> {
    const account = await this.require(tenantId, id);
    const updated = lockAccount(account, until);
    await this.repository.save(updated);
    await this.emit(identityAccountLocked(updated, until));
    return updated;
  }

  /** Clear lockout counters; a locked account returns to `active`. */
  async unlock(tenantId: TenantId, id: Uuid): Promise<IdentityAccount> {
    const account = await this.require(tenantId, id);
    const from = account.status;
    const updated = clearFailedAttempts(account);
    await this.repository.save(updated);
    if (updated.status !== from) {
      await this.emit(identityAccountStatusChanged(updated, from));
    }
    return updated;
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  private async changeStatus(
    tenantId: TenantId,
    id: Uuid,
    transition: (account: IdentityAccount) => IdentityAccount,
  ): Promise<IdentityAccount> {
    const account = await this.require(tenantId, id);
    const from = account.status;
    const updated = transition(account);
    await this.repository.save(updated);
    await this.emit(identityAccountStatusChanged(updated, from));
    return updated;
  }

  private async assertIdentifierFree(
    tenantId: TenantId,
    identifier: LoginIdentifier,
  ): Promise<void> {
    const existing = await this.repository.findByIdentifier(
      tenantId,
      identifier.type,
      identifier.value,
    );
    if (existing) {
      throw new IdentifierInUseError(identifier.type, identifier.value);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<IdentityAccount> {
    const account = await this.repository.findById(tenantId, id);
    if (!account) {
      throw new IdentityAccountNotFoundError(id);
    }
    return account;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
