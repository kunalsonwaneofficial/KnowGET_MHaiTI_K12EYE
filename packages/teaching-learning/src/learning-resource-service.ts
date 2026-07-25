import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  LearningResourceNotFoundError,
  OrganizationNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
} from "./errors";
import {
  archiveLearningResource,
  createLearningResource,
  type LearningResource,
  publishLearningResource,
  renameLearningResource,
  reviseLearningResource,
  setResourceDescription,
  setResourceOutcomes,
  setResourceTags,
  setResourceUrl,
} from "./learning-resource";
import type { LearningResourceType } from "./learning-resource-type";
import { learningResourceAdded } from "./teaching-learning-events";
import type { LearningResourceRepository, OrganizationDirectory, SubjectDirectory } from "./ports";

export interface LearningResourceServiceDeps {
  readonly repository: LearningResourceRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects?: SubjectDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateLearningResourceInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly resourceType: LearningResourceType;
  readonly description?: string | null;
  readonly url?: string | null;
  readonly tags?: readonly string[];
  readonly subjectId?: Uuid | null;
  readonly learningOutcomeIds?: readonly Uuid[];
}

/**
 * Application service for learning resources. Adds a resource to the library against a
 * validated Organization (and, when mapped, a validated Subject), and manages its versioned
 * draft → published → archived lifecycle so material is reusable across lessons. Publishes
 * {@link learningResourceAdded} on creation.
 */
export class LearningResourceService {
  private readonly repository: LearningResourceRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LearningResourceServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
    this.events = deps.events;
  }

  async create(input: CreateLearningResourceInput): Promise<LearningResource> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTeachingError(input.organizationId);
    }
    if (
      input.subjectId &&
      this.subjects &&
      !(await this.subjects.exists(input.tenantId, input.subjectId))
    ) {
      throw new SubjectNotFoundForTeachingError(input.subjectId);
    }
    const resource = createLearningResource(input);
    await this.repository.save(resource);
    await this.emit(learningResourceAdded(resource));
    return resource;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => renameLearningResource(r, title));
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => setResourceDescription(r, description));
  }

  async setUrl(tenantId: TenantId, id: Uuid, url: string | null): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => setResourceUrl(r, url));
  }

  async setTags(tenantId: TenantId, id: Uuid, tags: readonly string[]): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => setResourceTags(r, tags));
  }

  async setOutcomes(
    tenantId: TenantId,
    id: Uuid,
    outcomeIds: readonly Uuid[],
  ): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => setResourceOutcomes(r, outcomeIds));
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => publishLearningResource(r));
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => reviseLearningResource(r, note));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<LearningResource> {
    return this.mutate(tenantId, id, (r) => archiveLearningResource(r));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<LearningResource> {
    return this.require(tenantId, id);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningResource[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<LearningResource[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (resource: LearningResource) => LearningResource,
  ): Promise<LearningResource> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<LearningResource> {
    const resource = await this.repository.findById(tenantId, id);
    if (!resource) {
      throw new LearningResourceNotFoundError(id);
    }
    return resource;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
