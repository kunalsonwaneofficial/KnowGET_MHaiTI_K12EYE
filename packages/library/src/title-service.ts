import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateIsbnError,
  OrganizationNotFoundForLibraryError,
  TitleNotFoundError,
} from "./errors";
import type { OrganizationDirectory, TitleRepository } from "./ports";
import { titleCataloged, titleRestored, titleWithdrawn } from "./library-events";
import {
  type CatalogTitleParams,
  catalogTitle,
  renameTitle,
  restoreTitle,
  setTitleAuthors,
  setTitleMetadata,
  setTitleSubjects,
  type Title,
  withdrawTitle,
} from "./title";

export interface TitleServiceDeps {
  readonly repository: TitleRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

type TitleMetadata = {
  isbn?: string | null;
  language?: string | null;
  publisher?: string | null;
  publicationYear?: number | null;
};

/**
 * Application service for catalog titles. Catalogs a title (validating the organization and a unique ISBN
 * when present), edits its authors/subjects/metadata, and drives the `active ↔ withdrawn` lifecycle,
 * publishing the title events.
 */
export class TitleService {
  private readonly repository: TitleRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: TitleServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async catalog(input: CatalogTitleParams): Promise<Title> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForLibraryError(input.organizationId);
    }
    const isbn = input.isbn?.trim() || null;
    if (isbn && (await this.repository.findByIsbn(input.tenantId, isbn))) {
      throw new DuplicateIsbnError(isbn);
    }
    const title = catalogTitle(input);
    await this.repository.save(title);
    await this.emit(titleCataloged(title));
    return title;
  }

  async rename(tenantId: TenantId, id: Uuid, newTitle: string): Promise<Title> {
    return this.mutate(tenantId, id, (t) => renameTitle(t, newTitle));
  }

  async setAuthors(tenantId: TenantId, id: Uuid, authors: readonly string[]): Promise<Title> {
    return this.mutate(tenantId, id, (t) => setTitleAuthors(t, authors));
  }

  async setSubjects(tenantId: TenantId, id: Uuid, subjects: readonly string[]): Promise<Title> {
    return this.mutate(tenantId, id, (t) => setTitleSubjects(t, subjects));
  }

  async setMetadata(tenantId: TenantId, id: Uuid, metadata: TitleMetadata): Promise<Title> {
    const isbn = metadata.isbn?.trim() || null;
    if (isbn) {
      const existing = await this.repository.findByIsbn(tenantId, isbn);
      if (existing && existing.id !== id) {
        throw new DuplicateIsbnError(isbn);
      }
    }
    return this.mutate(tenantId, id, (t) => setTitleMetadata(t, metadata));
  }

  async withdraw(tenantId: TenantId, id: Uuid): Promise<Title> {
    const updated = withdrawTitle(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(titleWithdrawn(updated));
    return updated;
  }

  async restore(tenantId: TenantId, id: Uuid): Promise<Title> {
    const updated = restoreTitle(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(titleRestored(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Title> {
    return this.require(tenantId, id);
  }

  async getByIsbn(tenantId: TenantId, isbn: string): Promise<Title> {
    const title = await this.repository.findByIsbn(tenantId, isbn);
    if (!title) {
      throw new TitleNotFoundError(isbn);
    }
    return title;
  }

  async list(tenantId: TenantId): Promise<Title[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Title[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(tenantId: TenantId, id: Uuid, fn: (title: Title) => Title): Promise<Title> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Title> {
    const title = await this.repository.findById(tenantId, id);
    if (!title) {
      throw new TitleNotFoundError(id);
    }
    return title;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
