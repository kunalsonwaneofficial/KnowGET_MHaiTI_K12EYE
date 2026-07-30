import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type ApiContract,
  type DefineApiContractParams,
  type ReviseApiContractParams,
  defineApiContract,
  deprecateApiContract,
  isApiContractServable,
  publishApiContract,
  reviseApiContract,
  sunsetApiContract,
} from "./api-contract";
import {
  ApiContractNotFoundError,
  DuplicateContractVersionError,
  OrganizationNotFoundForGatewayError,
  PersonNotFoundForGatewayError,
  UnusableSuccessorVersionError,
} from "./errors";
import {
  contractDefined,
  contractDeprecated,
  contractPublished,
  contractSunset,
} from "./gateway-events";
import { normalizeKey } from "./gateway-value";
import type { ApiContractRepository, OrganizationDirectory, PersonDirectory } from "./ports";

/**
 * Application service for capability contracts — the versions of itself the institution has published to the
 * outside world, and the notice it has given about withdrawing them.
 *
 * The aggregate enforces the promise a single contract makes. Four rules cannot be decided from one contract in
 * hand, and they live here.
 *
 * **A capability and version pair is taken once, tenant-wide.** Not per organization, which looks like the
 * natural boundary and is the wrong one. The version is the string an integrator pins to, and an integrator
 * holds one consumer key against the whole tenant; if two schools in a trust could each publish their own `v2`
 * of `admissions.applications`, then `v2` means two different shapes to one caller and the specification they
 * were handed is only accidentally the one they get. A tenant that genuinely needs two shapes has two
 * capabilities, and naming them is the work the collision is asking for.
 *
 * **The publisher is a real person.** Publication is the one irreversible act in this aggregate — the shape can
 * never change afterwards — and the reasoning behind an irreversible act is recoverable only through the person
 * who performed it. An unattributable publication is a promise the institution is bound by and cannot explain.
 *
 * **The named successor has to be somewhere an integrator could actually go.** A deprecation notice is half a
 * message; *move to this instead* is the half that decides whether it is a migration plan or a countdown. Three
 * ways the successor fails and all three produce the same experience: it does not exist, it is the very version
 * being deprecated, or it exists as a draft or a sunset version and is not answering calls. The integrator finds
 * out which at the moment they act on the notice, which is the moment the old version stops working.
 *
 * **A revision to a draft is not announced.** The asymmetry with every other move here is deliberate: nothing
 * was promised to anybody while the contract sat in draft, so there is no one the change is news to.
 * {@link ApiContractService.publish} is the first event a subscriber sees about a contract's shape, and that is
 * correct, because it is the first moment the shape is anyone else's business.
 *
 * Order in {@link ApiContractService.define} and {@link ApiContractService.deprecate} follows the same rule the
 * rest of this package does: the aggregate runs first, so a malformed key, a blank specification reference or a
 * notice period below the floor is refused without the store being touched, and the lookups run afterwards in
 * increasing order of what they cost.
 */
export interface ApiContractServiceDeps {
  readonly repository: ApiContractRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ApiContractService {
  private readonly repository: ApiContractRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ApiContractServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /** Draft a version of a capability. Nothing is promised to anybody until it is published. */
  async define(params: DefineApiContractParams): Promise<ApiContract> {
    const contract = defineApiContract(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireVersionFree(contract);
    await this.repository.save(contract);
    await this.emit(contractDefined(contract));
    return contract;
  }

  /**
   * Change the draft's text and the specification it points at.
   *
   * Refused outright once the contract is published — by the aggregate, which is where that promise belongs.
   * Nothing is announced; see the class comment.
   */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    params: ReviseApiContractParams,
  ): Promise<ApiContract> {
    const next = reviseApiContract(await this.require(tenantId, id), params);
    await this.repository.save(next);
    return next;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Publish the version and freeze it, in the name of the person answerable for the promise. */
  async publish(tenantId: TenantId, id: Uuid, publishedBy: Uuid): Promise<ApiContract> {
    await this.requirePerson(tenantId, publishedBy, "person publishing the contract");
    return this.transition(tenantId, id, publishApiContract, contractPublished, publishedBy);
  }

  /**
   * Give notice that the version will stop answering, and say when and what replaces it.
   *
   * The successor is looked up after the aggregate has passed, because the aggregate's refusals — not published,
   * notice below the floor, a sunset date before its own announcement — cost nothing to reach and are about the
   * request as submitted. The successor lookup is the one piece of I/O this operation adds, and there is no
   * reason to pay for it in order to reject a notice that was never going to be accepted.
   */
  async deprecate(
    tenantId: TenantId,
    id: Uuid,
    announcedAt: ISODateString,
    sunsetAt: ISODateString,
    supersededByVersion: string,
  ): Promise<ApiContract> {
    const contract = await this.require(tenantId, id);
    const next = deprecateApiContract(contract, announcedAt, sunsetAt, supersededByVersion);
    await this.requireUsableSuccessor(contract, normalizeKey(supersededByVersion));
    await this.repository.save(next);
    await this.emit(contractDeprecated(next));
    return next;
  }

  /** Stop answering. Reachable from a deprecation that has run its notice, and from a withdrawn draft. */
  async sunset(tenantId: TenantId, id: Uuid): Promise<ApiContract> {
    return this.transition(tenantId, id, sunsetApiContract, contractSunset);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One contract, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ApiContract> {
    return this.require(tenantId, id);
  }

  /**
   * One contract by the pair an integrator addresses it with, or a 404.
   *
   * Both halves are normalised before the lookup and the refusal quotes the normalised pair, so a caller who
   * asked for `V2` is told which version was searched for rather than the one they typed.
   */
  async getByCapabilityAndVersion(
    tenantId: TenantId,
    capabilityKey: string,
    contractVersion: string,
  ): Promise<ApiContract> {
    const capability = normalizeKey(capabilityKey);
    const version = normalizeKey(contractVersion);
    const contract = await this.repository.findByCapabilityAndVersion(
      tenantId,
      capability,
      version,
    );
    if (!contract) {
      throw new ApiContractNotFoundError(`${capability}@${version}`);
    }
    return contract;
  }

  /** Every version of one capability, oldest version string first, drafts and sunset ones included. */
  async listByCapability(
    tenantId: TenantId,
    capabilityKey: string,
  ): Promise<readonly ApiContract[]> {
    return this.repository.listByCapability(tenantId, normalizeKey(capabilityKey));
  }

  /** What the institution is answering right now: published, plus deprecated and not yet past sunset. */
  async listServable(tenantId: TenantId, organizationId: Uuid): Promise<readonly ApiContract[]> {
    return this.repository.listServable(tenantId, organizationId);
  }

  /**
   * What is on notice.
   *
   * The read a migration is run off. Every entry carries a sunset date and a named successor, which is what
   * turns *we are retiring things* into a list somebody can work through and a date they can be held to.
   */
  async listDeprecated(tenantId: TenantId, organizationId: Uuid): Promise<readonly ApiContract[]> {
    return this.repository.listDeprecated(tenantId, organizationId);
  }

  /** Every contract in the tenant, in every status. */
  async list(tenantId: TenantId): Promise<readonly ApiContract[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The contract under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ApiContract> {
    const contract = await this.repository.findById(tenantId, id);
    if (!contract) {
      throw new ApiContractNotFoundError(id);
    }
    return contract;
  }

  /** The institution this contract is published by, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGatewayError(organizationId);
    }
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForGatewayError(personId, role);
    }
  }

  /** No other contract already holds this capability at this version anywhere in the tenant. */
  private async requireVersionFree(contract: ApiContract): Promise<void> {
    const existing = await this.repository.findByCapabilityAndVersion(
      contract.tenantId,
      contract.capabilityKey,
      contract.contractVersion,
    );
    if (existing) {
      throw new DuplicateContractVersionError(contract.capabilityKey, contract.contractVersion);
    }
  }

  /**
   * The version named as the successor is one an integrator could move onto today.
   *
   * The self-reference check runs before the lookup because it needs no lookup, and because the record it would
   * otherwise find is the very contract being deprecated — a notice that reads *this version is being retired,
   * move to this version* and passes every other test.
   */
  private async requireUsableSuccessor(
    contract: ApiContract,
    supersededByVersion: string,
  ): Promise<void> {
    if (supersededByVersion === contract.contractVersion) {
      throw new UnusableSuccessorVersionError(
        contract.capabilityKey,
        supersededByVersion,
        "is the version being deprecated",
      );
    }
    const successor = await this.repository.findByCapabilityAndVersion(
      contract.tenantId,
      contract.capabilityKey,
      supersededByVersion,
    );
    if (!successor) {
      throw new UnusableSuccessorVersionError(
        contract.capabilityKey,
        supersededByVersion,
        "does not exist",
      );
    }
    if (!isApiContractServable(successor)) {
      throw new UnusableSuccessorVersionError(
        contract.capabilityKey,
        supersededByVersion,
        `is ${successor.status}`,
      );
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (contract: ApiContract, ...args: TArgs) => ApiContract,
    announce: (contract: ApiContract) => DomainEvent,
    ...args: TArgs
  ): Promise<ApiContract> {
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
