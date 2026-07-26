import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  activateChapter,
  type AlumniChapter,
  archiveChapter,
  type CreateAlumniChapterParams,
  createAlumniChapter,
  deactivateChapter,
  renameChapter,
  setChapterRegion,
  setChapterType,
} from "./alumni-chapter";
import type { ChapterType } from "./alumni-value";
import {
  chapterActivated,
  chapterArchived,
  chapterCreated,
  chapterDeactivated,
  chapterRegionSet,
  chapterRenamed,
  chapterTypeSet,
} from "./alumni-events";
import {
  ChapterNotFoundError,
  DuplicateChapterCodeError,
  OrganizationNotFoundForAlumniError,
} from "./errors";
import type { AlumniChapterRepository, OrganizationDirectory } from "./ports";

export interface AlumniChapterServiceDeps {
  readonly repository: AlumniChapterRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for alumni chapters. Creates a chapter (validating the organization and a unique code
 * per tenant), edits its name / type / region, and drives `forming → active ↔ inactive → archived`,
 * publishing the chapter events.
 */
export class AlumniChapterService {
  private readonly repository: AlumniChapterRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AlumniChapterServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateAlumniChapterParams): Promise<AlumniChapter> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAlumniError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateChapterCodeError(input.code.trim());
    }
    const chapter = createAlumniChapter(input);
    await this.repository.save(chapter);
    await this.emit(chapterCreated(chapter));
    return chapter;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AlumniChapter> {
    const updated = renameChapter(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(chapterRenamed(updated));
    return updated;
  }

  async setType(tenantId: TenantId, id: Uuid, type: ChapterType): Promise<AlumniChapter> {
    const updated = setChapterType(await this.require(tenantId, id), type);
    await this.repository.save(updated);
    await this.emit(chapterTypeSet(updated));
    return updated;
  }

  async setRegion(tenantId: TenantId, id: Uuid, region: string | null): Promise<AlumniChapter> {
    const updated = setChapterRegion(await this.require(tenantId, id), region);
    await this.repository.save(updated);
    await this.emit(chapterRegionSet(updated));
    return updated;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<AlumniChapter> {
    const updated = activateChapter(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(chapterActivated(updated));
    return updated;
  }

  async deactivate(tenantId: TenantId, id: Uuid): Promise<AlumniChapter> {
    const updated = deactivateChapter(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(chapterDeactivated(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AlumniChapter> {
    const updated = archiveChapter(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(chapterArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AlumniChapter> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<AlumniChapter> {
    const chapter = await this.repository.findByCode(tenantId, code);
    if (!chapter) {
      throw new ChapterNotFoundError(code);
    }
    return chapter;
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniChapter[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AlumniChapter> {
    const chapter = await this.repository.findById(tenantId, id);
    if (!chapter) {
      throw new ChapterNotFoundError(id);
    }
    return chapter;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
