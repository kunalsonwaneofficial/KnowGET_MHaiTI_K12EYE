import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type ApiConsumer,
  type RegisterApiConsumerParams,
  activateApiConsumer,
  grantConsumerScopes,
  reassignApiConsumer,
  renameApiConsumer,
  registerApiConsumer,
  retireApiConsumer,
  revokeConsumerScopes,
  rotateConsumerCredential,
  suspendApiConsumer,
} from "./api-consumer";
import {
  ApiConsumerNotFoundError,
  DuplicateConsumerKeyError,
  OrganizationNotFoundForGatewayError,
  PersonNotFoundForGatewayError,
  UnknownScopeError,
} from "./errors";
import {
  consumerActivated,
  consumerCredentialRotated,
  consumerRegistered,
  consumerRetired,
  consumerScopesChanged,
  consumerSuspended,
} from "./gateway-events";
import { normalizeKey } from "./gateway-value";
import type {
  ApiConsumerRepository,
  OrganizationDirectory,
  PersonDirectory,
  ScopeCatalogue,
} from "./ports";

/**
 * Application service for API consumers — the register of everyone outside the institution who is allowed to
 * call it.
 *
 * Four rules live here rather than in the aggregate, because none of them is decidable from one consumer in
 * hand.
 *
 * **The key is taken permanently.** A consumer key is what every traffic policy, quota ledger, access log and
 * scope grant refers to an integration by, and it is the string that appears in an incident review two years
 * after the integration was switched off. Two consumers under one key would make every one of those records
 * ambiguous, so the check runs tenant-wide and retired consumers still hold theirs. A retired key freed for
 * reuse is worse than a key held forever: the new consumer inherits the old one's history in every report that
 * groups by key, and nobody reading those reports has any way to know it happened.
 *
 * **The owner is a real person.** Never `null`, unlike an actor elsewhere in this platform, and that asymmetry
 * is the point of the field. An anonymous *who filed this* is a legitimate position; an anonymous *who is
 * accountable for this integration having access to student records* is the state an institution discovers
 * during a breach review, when the answer to "whose is this" turns out to be nobody's.
 *
 * **The scopes exist.** Granting a scope the platform does not issue is worse than granting nothing, because
 * the record plainly shows it granted. Every permission check downstream compares against a string no route
 * will ever require, so the consumer is refused everywhere while their grant says otherwise, and the
 * integrator's first support conversation is spent establishing that the platform and their contract disagree
 * about what a scope is.
 *
 * **A revocation is not checked against the catalogue.** The asymmetry with granting is deliberate. Revoking
 * asks the platform to make sure a consumer does not hold something, and that intent is satisfied whether or not
 * the platform still issues it — so refusing would make a scope the institution has since withdrawn impossible
 * to take away from the consumers who were granted it while it existed. The grammar is still enforced, by the
 * aggregate, because a malformed string could not be held in the first place.
 *
 * Order in {@link ApiConsumerService.register} is deliberate. The aggregate is built **first**, so a plaintext
 * credential, a malformed key or an empty scope grant is refused without the store being touched at all — and in
 * the credential case, without the value having travelled any further than it already had. Then the
 * organization, then the key, which is one lookup that makes every remaining check moot when it fails. The scope
 * walk is last because it is the only check whose cost scales with the request.
 */
export interface ApiConsumerServiceDeps {
  readonly repository: ApiConsumerRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly scopes: ScopeCatalogue;
  readonly events?: Pick<EventBus, "publish">;
}

export class ApiConsumerService {
  private readonly repository: ApiConsumerRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly scopes: ScopeCatalogue;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ApiConsumerServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.scopes = deps.scopes;
    this.events = deps.events;
  }

  // --- Registration ----------------------------------------------------------------

  /** Admit an integration to the institution, with an owner and the scopes it is to hold. */
  async register(params: RegisterApiConsumerParams): Promise<ApiConsumer> {
    const consumer = registerApiConsumer(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, consumer.consumerKey);
    await this.requirePerson(params.tenantId, params.ownerId, "owner of the integration");
    await this.requireActor(
      params.tenantId,
      params.registeredBy,
      "person registering the consumer",
    );
    await this.requireScopes(params.tenantId, consumer.grantedScopes);
    await this.repository.save(consumer);
    await this.emit(consumerRegistered(consumer));
    return consumer;
  }

  /** Change the label an operator reads. The key everything else refers to does not move. */
  async rename(tenantId: TenantId, id: Uuid, displayName: string): Promise<ApiConsumer> {
    return this.revise(tenantId, id, renameApiConsumer, displayName);
  }

  /**
   * Hand accountability to somebody else.
   *
   * The new owner is checked before the transition rather than after, so a reassignment to an identifier that
   * resolves to nobody leaves the consumer with the owner it had. The failure mode this closes is the one where
   * an offboarding script reassigns every departing person's integrations to a successor whose record has not
   * been created yet, and every consumer involved ends up owned by a string.
   */
  async reassign(tenantId: TenantId, id: Uuid, ownerId: Uuid): Promise<ApiConsumer> {
    await this.requirePerson(tenantId, ownerId, "owner of the integration");
    return this.revise(tenantId, id, reassignApiConsumer, ownerId);
  }

  // --- Credentials -----------------------------------------------------------------

  /** Point the consumer at a different secret, and announce that a rotation happened. */
  async rotateCredential(
    tenantId: TenantId,
    id: Uuid,
    credentialRef: string,
  ): Promise<ApiConsumer> {
    return this.transition(
      tenantId,
      id,
      rotateConsumerCredential,
      consumerCredentialRotated,
      credentialRef,
    );
  }

  // --- Scopes ----------------------------------------------------------------------

  /** Widen what the consumer may reach. Every scope named must be one the platform issues. */
  async grantScopes(tenantId: TenantId, id: Uuid, scopes: readonly string[]): Promise<ApiConsumer> {
    await this.requireScopes(tenantId, scopes.map(normalizeKey));
    return this.transition(tenantId, id, grantConsumerScopes, consumerScopesChanged, scopes);
  }

  /** Narrow what the consumer may reach. Nothing is checked against the catalogue; see the class comment. */
  async revokeScopes(
    tenantId: TenantId,
    id: Uuid,
    scopes: readonly string[],
  ): Promise<ApiConsumer> {
    return this.transition(tenantId, id, revokeConsumerScopes, consumerScopesChanged, scopes);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Let the consumer call. The only status the fabric serves. */
  async activate(tenantId: TenantId, id: Uuid): Promise<ApiConsumer> {
    return this.transition(tenantId, id, activateApiConsumer, consumerActivated);
  }

  /** Stop serving the consumer, with the reason whoever asks will be told. */
  async suspend(tenantId: TenantId, id: Uuid, reason: string): Promise<ApiConsumer> {
    return this.transition(tenantId, id, suspendApiConsumer, consumerSuspended, reason);
  }

  /** End the integration. Terminal, and the key stays taken. */
  async retire(tenantId: TenantId, id: Uuid): Promise<ApiConsumer> {
    return this.transition(tenantId, id, retireApiConsumer, consumerRetired);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One consumer, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ApiConsumer> {
    return this.require(tenantId, id);
  }

  /**
   * One consumer by the key everything refers to it by, or a 404.
   *
   * The key is normalised before the lookup and the refusal names the normalised form, so a caller who typed a
   * stray capital is told which key was searched for rather than the one they sent.
   */
  async getByKey(tenantId: TenantId, consumerKey: string): Promise<ApiConsumer> {
    const wanted = normalizeKey(consumerKey);
    const consumer = await this.repository.findByKey(tenantId, wanted);
    if (!consumer) {
      throw new ApiConsumerNotFoundError(wanted);
    }
    return consumer;
  }

  /** The integrations currently allowed to call, for one institution. */
  async listActive(tenantId: TenantId, organizationId: Uuid): Promise<readonly ApiConsumer[]> {
    return this.repository.listActive(tenantId, organizationId);
  }

  /**
   * Every integration one person is accountable for.
   *
   * The read an offboarding actually turns on. *Which of our integrations belonged to the person who left on
   * Friday* has no answer without it, and the integrations that outlive the people who arranged them are
   * precisely the ones nobody reviews.
   */
  async listByOwner(tenantId: TenantId, ownerId: Uuid): Promise<readonly ApiConsumer[]> {
    return this.repository.listByOwner(tenantId, ownerId);
  }

  /** Every consumer in the tenant, retired ones included. */
  async list(tenantId: TenantId): Promise<readonly ApiConsumer[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The consumer under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ApiConsumer> {
    const consumer = await this.repository.findById(tenantId, id);
    if (!consumer) {
      throw new ApiConsumerNotFoundError(id);
    }
    return consumer;
  }

  /** The institution this registration hangs off, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGatewayError(organizationId);
    }
  }

  /**
   * No other consumer already answers to this key.
   *
   * Tenant-wide rather than per organization, and retired consumers count. Two schools in one trust cannot each
   * have a `sis-sync`, because the key is what a shared quota ledger and a shared access log group by, and
   * a report that silently merges two institutions' traffic is worse than a naming collision at registration.
   */
  private async requireKeyFree(tenantId: TenantId, consumerKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, consumerKey)) {
      throw new DuplicateConsumerKeyError(consumerKey);
    }
  }

  /** An actor, when one is named. `null` is an automated onboarding step, which this contract permits. */
  private async requireActor(
    tenantId: TenantId,
    personId: Uuid | null,
    role: string,
  ): Promise<void> {
    if (personId === null) return;
    await this.requirePerson(tenantId, personId, role);
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForGatewayError(personId, role);
    }
  }

  /**
   * Every scope named is one the platform issues.
   *
   * Sequential rather than concurrent, and the first unknown scope is the refusal. A grant naming four scopes
   * the platform does not issue is fixed the same way as one naming a single unknown scope — by the operator
   * reading the catalogue — and reporting all four would cost four round trips on every successful grant to
   * save round trips on failing ones.
   */
  private async requireScopes(tenantId: TenantId, scopes: readonly string[]): Promise<void> {
    for (const scope of scopes) {
      if (!(await this.scopes.exists(tenantId, scope))) {
        throw new UnknownScopeError(scope);
      }
    }
  }

  /** Load, apply a pure revision, save. Nothing is announced: a label is not news. */
  private async revise<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (consumer: ApiConsumer, ...args: TArgs) => ApiConsumer,
    ...args: TArgs
  ): Promise<ApiConsumer> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    return next;
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (consumer: ApiConsumer, ...args: TArgs) => ApiConsumer,
    announce: (consumer: ApiConsumer) => DomainEvent,
    ...args: TArgs
  ): Promise<ApiConsumer> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
