import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  OrganizationNotFoundForLifecycleError,
  PersonNotFoundForLifecycleError,
  ProspectNotFoundError,
} from "./errors";
import type { OrganizationDirectory, PersonDirectory, ProspectRepository } from "./ports";
import {
  contactProspect,
  convertProspect,
  type CreateProspectParams,
  createProspect,
  loseProspect,
  type Prospect,
  qualifyProspect,
  recordFollowUp,
} from "./prospect";
import { prospectCreated } from "./student-lifecycle-events";

export interface ProspectServiceDeps {
  readonly repository: ProspectRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for prospects — the enquiry funnel. Captures enquiries
 * (validating the organization and the prospective learner's Person), tracks
 * follow-ups, and drives qualification through to conversion or loss — publishing
 * `student.prospect.created`. Transport- and persistence-agnostic.
 */
export class ProspectService {
  private readonly repository: ProspectRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ProspectServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async capture(input: CreateProspectParams): Promise<Prospect> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.personId);
    const prospect = createProspect(input);
    await this.repository.save(prospect);
    await this.emit(prospectCreated(prospect));
    return prospect;
  }

  async recordFollowUp(tenantId: TenantId, id: Uuid, note: string, byId?: Uuid): Promise<Prospect> {
    const updated = recordFollowUp(await this.require(tenantId, id), note, byId);
    await this.repository.save(updated);
    return updated;
  }

  async contact(tenantId: TenantId, id: Uuid): Promise<Prospect> {
    return this.mutate(tenantId, id, contactProspect);
  }

  async qualify(tenantId: TenantId, id: Uuid): Promise<Prospect> {
    return this.mutate(tenantId, id, qualifyProspect);
  }

  async convert(tenantId: TenantId, id: Uuid): Promise<Prospect> {
    return this.mutate(tenantId, id, convertProspect);
  }

  async lose(tenantId: TenantId, id: Uuid): Promise<Prospect> {
    return this.mutate(tenantId, id, loseProspect);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Prospect> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Prospect[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prospect[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (prospect: Prospect) => Prospect,
  ): Promise<Prospect> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForLifecycleError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForLifecycleError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Prospect> {
    const prospect = await this.repository.findById(tenantId, id);
    if (!prospect) {
      throw new ProspectNotFoundError(id);
    }
    return prospect;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
