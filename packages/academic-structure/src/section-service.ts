import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { sectionCreated } from "./academic-structure-events";
import { ClassNotFoundError, DuplicateSectionError, SectionNotFoundError } from "./errors";
import {
  activateSection,
  closeSection,
  createSection,
  renameSection,
  type Section,
  setSectionCapacity,
} from "./section";
import type { AcademicClassRepository, SectionRepository } from "./ports";

export interface SectionServiceDeps {
  readonly repository: SectionRepository;
  readonly classes: AcademicClassRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateSectionInput {
  readonly tenantId: TenantId;
  readonly classId: Uuid;
  readonly name: string;
  readonly capacity: number;
}

/**
 * Application service for sections. Creates a section within a validated Class, deriving
 * the section's organization from that class, at most one per (class, name), and drives
 * the planned → active → closed lifecycle and capacity. Publishes {@link sectionCreated}.
 */
export class SectionService {
  private readonly repository: SectionRepository;
  private readonly classes: AcademicClassRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SectionServiceDeps) {
    this.repository = deps.repository;
    this.classes = deps.classes;
    this.events = deps.events;
  }

  async create(input: CreateSectionInput): Promise<Section> {
    const organizationId = await this.resolveClassOrganization(input.tenantId, input.classId);
    await this.assertNoSection(input.tenantId, input.classId, input.name);
    const section = createSection({ ...input, organizationId });
    await this.repository.save(section);
    await this.emit(sectionCreated(section));
    return section;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Section> {
    return this.mutate(tenantId, id, (s) => renameSection(s, name));
  }

  async setCapacity(tenantId: TenantId, id: Uuid, capacity: number): Promise<Section> {
    return this.mutate(tenantId, id, (s) => setSectionCapacity(s, capacity));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<Section> {
    return this.mutate(tenantId, id, (s) => activateSection(s));
  }

  async close(tenantId: TenantId, id: Uuid): Promise<Section> {
    return this.mutate(tenantId, id, (s) => closeSection(s));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Section> {
    return this.require(tenantId, id);
  }

  async listForClass(tenantId: TenantId, classId: Uuid): Promise<Section[]> {
    return this.repository.listByClass(tenantId, classId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Section[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<Section[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (section: Section) => Section,
  ): Promise<Section> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async resolveClassOrganization(tenantId: TenantId, classId: Uuid): Promise<Uuid> {
    const klass = await this.classes.findById(tenantId, classId);
    if (!klass) {
      throw new ClassNotFoundError(classId);
    }
    return klass.organizationId;
  }

  private async assertNoSection(tenantId: TenantId, classId: Uuid, name: string): Promise<void> {
    if (await this.repository.findByName(tenantId, classId, name)) {
      throw new DuplicateSectionError(classId, name);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Section> {
    const section = await this.repository.findById(tenantId, id);
    if (!section) {
      throw new SectionNotFoundError(id);
    }
    return section;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
