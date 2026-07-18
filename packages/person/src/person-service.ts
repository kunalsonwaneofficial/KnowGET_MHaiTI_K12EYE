import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AddContactInput,
  addContact,
  mergeContacts,
  removeContact,
  setPrimaryContact,
} from "./contact";
import { CannotMergePersonError, DuplicatePersonError, PersonNotFoundError } from "./errors";
import { matchKey } from "./matching";
import type { PersonName } from "./name";
import {
  type CreatePersonParams,
  createPerson,
  type Gender,
  markMerged,
  type Person,
  type PersonStatus,
  renamePerson,
  setContacts,
  setDateOfBirth,
  setGender,
  transitionPersonStatus,
} from "./person";
import {
  personContactAdded,
  personMerged,
  personRegistered,
  personRenamed,
  personStatusChanged,
} from "./person-events";
import type { PersonRepository } from "./person-repository";

export interface RegisterPersonInput extends CreatePersonParams {
  /** Skip the duplicate guard (e.g. after a human confirms it is a distinct person). */
  readonly allowDuplicate?: boolean;
}

/**
 * Application service for the person domain. Registers people (with duplicate
 * detection by match key), maintains names/demographics/contacts, drives the
 * lifecycle state machine, and merges duplicate records — publishing a domain
 * event per change. Persona-agnostic and transport-agnostic.
 */
export class PersonService {
  constructor(
    private readonly repository: PersonRepository,
    private readonly events?: Pick<EventBus, "publish">,
  ) {}

  async register(input: RegisterPersonInput): Promise<Person> {
    const key = matchKey(input.name, input.dateOfBirth ?? null);
    if (input.allowDuplicate !== true) {
      const candidates = await this.repository.findByMatchKey(input.tenantId, key);
      if (candidates.some((p) => p.status === "active")) {
        throw new DuplicatePersonError(key);
      }
    }
    const person = createPerson(input);
    await this.repository.save(person);
    await this.emit(personRegistered(person));
    return person;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Person> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Person[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** Active people who share this person's match key (candidate duplicates). */
  async findPotentialDuplicates(tenantId: TenantId, id: Uuid): Promise<Person[]> {
    const person = await this.require(tenantId, id);
    const candidates = await this.repository.findByMatchKey(
      tenantId,
      matchKey(person.name, person.dateOfBirth),
    );
    return candidates.filter((p) => p.id !== id && p.status === "active");
  }

  async rename(tenantId: TenantId, id: Uuid, name: PersonName): Promise<Person> {
    const renamed = renamePerson(await this.require(tenantId, id), name);
    await this.repository.save(renamed);
    await this.emit(personRenamed(renamed));
    return renamed;
  }

  async setDemographics(
    tenantId: TenantId,
    id: Uuid,
    demographics: { dateOfBirth?: string | null; gender?: Gender },
  ): Promise<Person> {
    let person = await this.require(tenantId, id);
    if (demographics.dateOfBirth !== undefined) {
      person = setDateOfBirth(person, demographics.dateOfBirth);
    }
    if (demographics.gender !== undefined) {
      person = setGender(person, demographics.gender);
    }
    await this.repository.save(person);
    return person;
  }

  async addContact(tenantId: TenantId, id: Uuid, input: AddContactInput): Promise<Person> {
    const person = await this.require(tenantId, id);
    const contacts = addContact(person.contacts, input);
    const updated = setContacts(person, contacts);
    await this.repository.save(updated);
    if (contacts.length > person.contacts.length) {
      await this.emit(personContactAdded(updated, input.type));
    }
    return updated;
  }

  async removeContact(tenantId: TenantId, id: Uuid, contactId: Uuid): Promise<Person> {
    const person = await this.require(tenantId, id);
    const updated = setContacts(person, removeContact(person.contacts, contactId));
    await this.repository.save(updated);
    return updated;
  }

  async setPrimaryContact(tenantId: TenantId, id: Uuid, contactId: Uuid): Promise<Person> {
    const person = await this.require(tenantId, id);
    const updated = setContacts(person, setPrimaryContact(person.contacts, contactId));
    await this.repository.save(updated);
    return updated;
  }

  async changeStatus(tenantId: TenantId, id: Uuid, to: PersonStatus): Promise<Person> {
    const person = await this.require(tenantId, id);
    const from = person.status;
    const updated = transitionPersonStatus(person, to);
    await this.repository.save(updated);
    await this.emit(personStatusChanged(updated, from));
    return updated;
  }

  /** Merge `mergedId` into `survivorId`: the survivor absorbs contacts; the other
   * becomes a terminal `merged` record pointing to the survivor. */
  async merge(tenantId: TenantId, survivorId: Uuid, mergedId: Uuid): Promise<Person> {
    if (survivorId === mergedId) {
      throw new CannotMergePersonError("a person cannot be merged into itself");
    }
    const survivor = await this.require(tenantId, survivorId);
    const source = await this.require(tenantId, mergedId);
    if (source.status === "merged") {
      throw new CannotMergePersonError("the source person is already merged");
    }
    const combined = setContacts(survivor, mergeContacts(survivor.contacts, source.contacts));
    const retired = markMerged(source, survivorId);
    await this.repository.save(combined);
    await this.repository.save(retired);
    await this.emit(personMerged(combined, mergedId));
    return combined;
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Person> {
    const person = await this.repository.findById(tenantId, id);
    if (!person) {
      throw new PersonNotFoundError(id);
    }
    return person;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
