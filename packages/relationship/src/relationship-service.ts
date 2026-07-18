import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateRelationshipError,
  PersonNotFoundForRelationshipError,
  RelationshipNotFoundError,
  SelfRelationshipError,
} from "./errors";
import { isSymmetricKind, type RelationshipKind } from "./kind";
import type { PersonDirectory, RelationshipRepository } from "./ports";
import {
  type CreateRelationshipParams,
  createRelationship,
  endRelationship,
  type Relationship,
} from "./relationship";
import { relationshipCreated, relationshipEnded } from "./relationship-events";

export interface RelationshipServiceDeps {
  readonly repository: RelationshipRepository;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the relationship domain. Relates two people with a
 * typed association (validating both exist in the tenant, rejecting
 * self-relationships and equivalent active duplicates), lists a person's
 * relationships, and ends them — publishing a domain event per change.
 * Persistence- and transport-agnostic.
 */
export class RelationshipService {
  private readonly repository: RelationshipRepository;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RelationshipServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async relate(input: CreateRelationshipParams): Promise<Relationship> {
    if (input.fromPersonId === input.toPersonId) {
      throw new SelfRelationshipError(input.fromPersonId);
    }
    await this.assertPersonExists(input.tenantId, input.fromPersonId);
    await this.assertPersonExists(input.tenantId, input.toPersonId);
    await this.assertNoDuplicate(input.tenantId, input.fromPersonId, input.toPersonId, input.kind);

    const relationship = createRelationship(input);
    await this.repository.save(relationship);
    await this.emit(relationshipCreated(relationship));
    return relationship;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Relationship> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Relationship[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** Every relationship touching a person (as `from` or `to`). */
  async listForPerson(tenantId: TenantId, personId: Uuid): Promise<Relationship[]> {
    return this.repository.findByPerson(tenantId, personId);
  }

  async end(tenantId: TenantId, id: Uuid, endDate?: string | null): Promise<Relationship> {
    const updated = endRelationship(await this.require(tenantId, id), endDate);
    await this.repository.save(updated);
    await this.emit(relationshipEnded(updated));
    return updated;
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForRelationshipError(personId);
    }
  }

  /**
   * Reject an equivalent active relationship. For symmetric kinds the pair is
   * unordered (A↔B == B↔A); for directed kinds only the same direction clashes.
   */
  private async assertNoDuplicate(
    tenantId: TenantId,
    from: Uuid,
    to: Uuid,
    kind: RelationshipKind,
  ): Promise<void> {
    const symmetric = isSymmetricKind(kind);
    for (const existing of await this.repository.findBetween(tenantId, from, to)) {
      if (existing.status !== "active" || existing.kind !== kind) {
        continue;
      }
      if (symmetric || (existing.fromPersonId === from && existing.toPersonId === to)) {
        throw new DuplicateRelationshipError(kind);
      }
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Relationship> {
    const relationship = await this.repository.findById(tenantId, id);
    if (!relationship) {
      throw new RelationshipNotFoundError(id);
    }
    return relationship;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
