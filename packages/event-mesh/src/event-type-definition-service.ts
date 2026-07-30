import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { assessCompatibility } from "./compatibility";
import {
  DuplicateEventTypeVersionError,
  EventTypeDefinitionNotFoundError,
  EventTypeNotPublishableError,
  NonSequentialEventTypeVersionError,
  OrganizationNotFoundForMeshError,
  PersonNotFoundForMeshError,
  SchemaIncompatibleError,
} from "./errors";
import {
  type DefineEventTypeParams,
  type EventTypeDefinition,
  type ReviseEventTypeParams,
  defineEventType,
  deprecateEventType,
  eventTypePublication,
  isEventTypeCarried,
  publishEventType,
  retireEventType,
  reviseEventType,
} from "./event-type-definition";
import {
  eventTypeDefined,
  eventTypeDeprecated,
  eventTypePublished,
  eventTypeRetired,
} from "./mesh-events";
import { FIRST_EVENT_TYPE_VERSION, normalizeKey } from "./mesh-value";
import type { PublicationVerdict } from "./mesh-view";
import type {
  EventTypeDefinitionRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for the event type registry — what facts the mesh knows how to carry, in what shape, at
 * which version, and on whose authority each version was promised.
 *
 * The aggregate holds everything decidable from one definition in hand: a published schema is frozen, a
 * deprecation carries ninety days of notice and names a later successor, a retirement follows a deprecation.
 * Four rules cannot be decided from one definition, because each of them is a question about what else the
 * registry holds, and those live here.
 *
 * **A key and a version name one definition, permanently.** That pair is what a consumer pins to, and a registry
 * holding two rows for it would let the shape a reader was written against change underneath that reader with
 * nothing in the record saying so. The namespace is tenant-wide rather than per organization, which follows the
 * store rather than being chosen against it: {@link EventTypeDefinitionRepository.findByKeyAndVersion} takes no
 * organization, because `admissions.application.submitted@v3` has to mean one shape to every consumer in the
 * trust or it means nothing to any of them.
 *
 * **Versions are consecutive.** A registry that accepted v5 after v2 would leave three numbers that mean
 * nothing, and the emptiness rather than the untidiness is the problem: a consumer told to move from v2 to v5
 * cannot tell whether v3 and v4 were withdrawn, never cut, or are still coming, and the compatibility chain the
 * whole package rests on now has a hole in it that no later act can close.
 *
 * **Compatibility is checked against the version immediately below, whatever status that version is in.** The
 * alternative — compare against the newest *published* version — reads as the more practical rule and quietly
 * leaves a gap. A draft cut while an older version was the newest published one is checked against that older
 * one, publishes, and is now the predecessor of a version nothing ever compared it to. Pairwise comparison
 * composes and that one does not: if every version is compatible with the one below it, a consumer pinned to v2
 * reading v5 is reading something the chain has already vouched for, and a chain with one unchecked link
 * vouches for nothing above it.
 *
 * **The publisher is a real person, and the named successor is somewhere a producer could actually go.**
 * Publication is the irreversible act here — the shape can never change afterwards — and the reasoning behind an
 * irreversible act is recoverable only through whoever performed it. A deprecation notice pointing at a version
 * that does not exist, or at one still in draft, is a countdown wearing a migration plan's clothes, and the
 * producer finds out which at the moment they act on it, which is the moment the old version stops.
 *
 * **A revision to a draft is not announced.** Nothing was promised to anybody while the definition sat in draft,
 * so there is nobody the change is news to. {@link EventTypeDefinitionService.publish} raises the first event a
 * subscriber sees about a shape, which is correct, because it is the first moment the shape is anyone else's
 * business.
 *
 * One read pays for three of these. {@link EventTypeDefinitionService.define} takes the version history once and
 * answers duplication, sequence and compatibility from it. Three lookups would be the obvious shape and would
 * buy three round trips to reach exactly the same refusals. Order otherwise follows the rest of the platform:
 * the aggregate runs first, so a malformed key, an impossible version or a schema the field validator refuses is
 * turned away without the store being touched, and the lookups run afterwards in increasing order of cost.
 */
export interface EventTypeDefinitionServiceDeps {
  readonly repository: EventTypeDefinitionRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class EventTypeDefinitionService {
  private readonly repository: EventTypeDefinitionRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EventTypeDefinitionServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.events = deps.events;
  }

  // --- Definition ------------------------------------------------------------------

  /** Register a version of an event type. Nothing is promised to anybody until it is published. */
  async define(params: DefineEventTypeParams): Promise<EventTypeDefinition> {
    const definition = defineEventType(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireRegistrable(definition);
    await this.repository.save(definition);
    await this.emit(eventTypeDefined(definition));
    return definition;
  }

  /**
   * Change everything about a draft that is still arguable, and re-read it against its predecessor.
   *
   * The compatibility check runs again rather than only at publication, and the reason is that a draft is
   * exactly the thing being edited. A registry that checked once at registration and again at publication would
   * hold a draft that drifted incompatible in between and say nothing about it until somebody tried to ship —
   * which is the one moment a refusal costs the most and teaches the least.
   *
   * Nothing is announced; see the class comment.
   */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    params: ReviseEventTypeParams,
  ): Promise<EventTypeDefinition> {
    const next = reviseEventType(await this.require(tenantId, id), params);
    await this.requireCompatibleWithPredecessor(next);
    await this.repository.save(next);
    return next;
  }

  // --- Lifecycle -------------------------------------------------------------------

  /** Publish the version and freeze its shape, in the name of the person answerable for the promise. */
  async publish(tenantId: TenantId, id: Uuid, publishedBy: Uuid): Promise<EventTypeDefinition> {
    await this.requirePerson(tenantId, publishedBy, "person publishing the event type");
    return this.transition(tenantId, id, publishEventType, eventTypePublished, publishedBy);
  }

  /**
   * Give notice that the version will stop being carried, and say when and what replaces it.
   *
   * The successor is looked up after the aggregate has passed, because the aggregate's refusals — not
   * published, notice below the floor, a retirement date before its own announcement, a successor numbered at or
   * below this version — cost nothing to reach and are all about the request as submitted. The lookup is the one
   * piece of I/O this operation adds, and there is no reason to pay for it to reject a notice that was never
   * going to be accepted.
   */
  async deprecate(
    tenantId: TenantId,
    id: Uuid,
    announcedAt: ISODateString,
    retireAt: ISODateString,
    supersededByVersion: number,
  ): Promise<EventTypeDefinition> {
    const definition = await this.require(tenantId, id);
    const next = deprecateEventType(definition, announcedAt, retireAt, supersededByVersion);
    await this.requireUsableSuccessor(definition, supersededByVersion);
    await this.repository.save(next);
    await this.emit(eventTypeDeprecated(next));
    return next;
  }

  /** Stop carrying the version. Reachable from a deprecation that has run its notice, and from a draft. */
  async retire(tenantId: TenantId, id: Uuid): Promise<EventTypeDefinition> {
    return this.transition(tenantId, id, retireEventType, eventTypeRetired);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One definition, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<EventTypeDefinition> {
    return this.require(tenantId, id);
  }

  /**
   * One definition by the pair a producer publishes under and a consumer pins to, or a 404.
   *
   * The key is normalised before the lookup and the refusal quotes the normalised pair, so a caller who asked
   * for `Admissions.Application.Submitted` is told which key was searched for rather than the one they typed.
   */
  async getByKeyAndVersion(
    tenantId: TenantId,
    eventTypeKey: string,
    version: number,
  ): Promise<EventTypeDefinition> {
    const key = normalizeKey(eventTypeKey);
    const definition = await this.repository.findByKeyAndVersion(tenantId, key, version);
    if (!definition) {
      throw new EventTypeDefinitionNotFoundError(`${key}@v${version}`);
    }
    return definition;
  }

  /** Every version of one event type, oldest first, drafts and retired versions included. */
  async listByKey(
    tenantId: TenantId,
    eventTypeKey: string,
  ): Promise<readonly EventTypeDefinition[]> {
    return this.repository.listByKey(tenantId, normalizeKey(eventTypeKey));
  }

  /** What a producer may publish against right now: published, plus deprecated and still inside notice. */
  async listCarried(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<readonly EventTypeDefinition[]> {
    return this.repository.listCarried(tenantId, organizationId);
  }

  /** Every definition in the tenant, in every status. */
  async list(tenantId: TenantId): Promise<readonly EventTypeDefinition[]> {
    return this.repository.listByTenant(tenantId);
  }

  /**
   * Whether the mesh accepts a publication of this version at an instant the caller names, and on what terms.
   *
   * `asOf` is an argument rather than the current instant for the reason every instant in this package is: the
   * question worth asking of a registry months later is *were these producers on notice in March*, and a verdict
   * that can only be computed for now is one that has to be reconstructed from what the retirement job happened
   * to be doing at the time.
   */
  async assessPublication(
    tenantId: TenantId,
    id: Uuid,
    asOf: ISODateString,
  ): Promise<PublicationVerdict> {
    return eventTypePublication(await this.require(tenantId, id), asOf);
  }

  // --- Internals -------------------------------------------------------------------

  /** The definition under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<EventTypeDefinition> {
    const definition = await this.repository.findById(tenantId, id);
    if (!definition) {
      throw new EventTypeDefinitionNotFoundError(id);
    }
    return definition;
  }

  /** The institution this event type belongs to, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForMeshError(organizationId);
    }
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForMeshError(personId, role);
    }
  }

  /**
   * The three questions a new version cannot answer about itself, settled from one read of its own history.
   *
   * The duplicate check runs before the sequence check even though the sequence check would refuse the same
   * request, because the two mean different things to whoever sent them. A repeat of an existing version is
   * usually a retry or a second submission of the same form; a version out of sequence is somebody numbering by
   * hand. Collapsing them into one refusal would tell the first caller their retry was a numbering mistake.
   */
  private async requireRegistrable(definition: EventTypeDefinition): Promise<void> {
    const history = await this.repository.listByKey(definition.tenantId, definition.eventTypeKey);
    const versions = history.map((sibling) => sibling.version);
    if (versions.includes(definition.version)) {
      throw new DuplicateEventTypeVersionError(definition.eventTypeKey, definition.version);
    }
    const expected = versions.length === 0 ? FIRST_EVENT_TYPE_VERSION : Math.max(...versions) + 1;
    if (definition.version !== expected) {
      throw new NonSequentialEventTypeVersionError(
        definition.eventTypeKey,
        expected,
        definition.version,
      );
    }
    this.requireCompatible(definition, history);
  }

  /** Read a revised draft against the version below it, which needs its history fetched afresh. */
  private async requireCompatibleWithPredecessor(definition: EventTypeDefinition): Promise<void> {
    const history = await this.repository.listByKey(definition.tenantId, definition.eventTypeKey);
    this.requireCompatible(definition, history);
  }

  /**
   * Refuse a schema that breaks the promise its event type declared, naming the changes that broke it.
   *
   * A first version has no predecessor and is not assessed at all. That is not a gap: compatibility is a
   * relation between two shapes, and the honest answer for the first one is that there is nothing yet to be
   * compatible with.
   */
  private requireCompatible(
    definition: EventTypeDefinition,
    history: readonly EventTypeDefinition[],
  ): void {
    const predecessor = history.find((sibling) => sibling.version === definition.version - 1);
    if (!predecessor) {
      return;
    }
    const verdict = assessCompatibility({
      eventTypeKey: definition.eventTypeKey,
      mode: definition.compatibilityMode,
      previous: predecessor.schemaFields,
      next: definition.schemaFields,
    });
    if (!verdict.compatible) {
      throw new SchemaIncompatibleError(
        definition.eventTypeKey,
        definition.version,
        definition.compatibilityMode,
        verdict.breakingChanges,
      );
    }
  }

  /**
   * The version named as the successor is one a producer could move onto today.
   *
   * There is no self-reference check here, unlike the gateway's equivalent, because the aggregate has already
   * refused any successor numbered at or below the version being deprecated — and a self-reference is the
   * boundary case of that rule rather than a separate mistake.
   */
  private async requireUsableSuccessor(
    definition: EventTypeDefinition,
    supersededByVersion: number,
  ): Promise<void> {
    const successor = await this.repository.findByKeyAndVersion(
      definition.tenantId,
      definition.eventTypeKey,
      supersededByVersion,
    );
    if (!successor) {
      throw new EventTypeDefinitionNotFoundError(
        `${definition.eventTypeKey}@v${supersededByVersion}`,
      );
    }
    if (!isEventTypeCarried(successor)) {
      throw new EventTypeNotPublishableError(
        definition.eventTypeKey,
        supersededByVersion,
        successor.status,
      );
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (definition: EventTypeDefinition, ...args: TArgs) => EventTypeDefinition,
    announce: (definition: EventTypeDefinition) => DomainEvent,
    ...args: TArgs
  ): Promise<EventTypeDefinition> {
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
