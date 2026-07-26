import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AlumniProfile,
  type CreateAlumniProfileParams,
  createAlumniProfile,
  markAlumniLapsed,
  optOutAlumni,
  reactivateAlumni,
  updateAlumniProfile,
} from "./alumni-profile";
import {
  alumniProfileCreated,
  alumniProfileLapsed,
  alumniProfileOptedOut,
  alumniProfileReactivated,
  alumniProfileUpdated,
} from "./alumni-events";
import {
  AlumniProfileNotFoundError,
  DuplicateAlumniProfileError,
  OrganizationNotFoundForAlumniError,
  PersonNotFoundForAlumniError,
} from "./errors";
import type { AlumniProfileRepository, OrganizationDirectory, PersonDirectory } from "./ports";

export interface AlumniProfileServiceDeps {
  readonly repository: AlumniProfileRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for alumni profiles — the network-membership anchor. Creates a profile (validating the
 * organization, the alumnus Person, and one profile per person per tenant), edits it, and drives
 * `active ↔ lapsed → opted_out`, publishing the profile events. The alumnus lifecycle record is Student
 * Lifecycle's (P2-D03); this service manages only the network membership.
 */
export class AlumniProfileService {
  private readonly repository: AlumniProfileRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AlumniProfileServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async create(input: CreateAlumniProfileParams): Promise<AlumniProfile> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAlumniError(input.organizationId);
    }
    if (!(await this.persons.exists(input.tenantId, input.alumnusPersonId))) {
      throw new PersonNotFoundForAlumniError(input.alumnusPersonId);
    }
    if (await this.repository.findByAlumnusPersonId(input.tenantId, input.alumnusPersonId)) {
      throw new DuplicateAlumniProfileError(input.alumnusPersonId);
    }
    const profile = createAlumniProfile(input);
    await this.repository.save(profile);
    await this.emit(alumniProfileCreated(profile));
    return profile;
  }

  async update(
    tenantId: TenantId,
    id: Uuid,
    patch: { graduationYear?: string; program?: string | null },
  ): Promise<AlumniProfile> {
    const updated = updateAlumniProfile(await this.require(tenantId, id), patch);
    await this.repository.save(updated);
    await this.emit(alumniProfileUpdated(updated));
    return updated;
  }

  async markLapsed(tenantId: TenantId, id: Uuid): Promise<AlumniProfile> {
    const updated = markAlumniLapsed(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(alumniProfileLapsed(updated));
    return updated;
  }

  async reactivate(tenantId: TenantId, id: Uuid): Promise<AlumniProfile> {
    const updated = reactivateAlumni(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(alumniProfileReactivated(updated));
    return updated;
  }

  async optOut(tenantId: TenantId, id: Uuid): Promise<AlumniProfile> {
    const updated = optOutAlumni(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(alumniProfileOptedOut(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AlumniProfile> {
    return this.require(tenantId, id);
  }

  async getByAlumnus(tenantId: TenantId, alumnusPersonId: Uuid): Promise<AlumniProfile | null> {
    return this.repository.findByAlumnusPersonId(tenantId, alumnusPersonId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AlumniProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new AlumniProfileNotFoundError(id);
    }
    return profile;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
