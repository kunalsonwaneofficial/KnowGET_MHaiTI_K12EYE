import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyLearningResourceFieldError, LearningResourceArchivedError } from "./errors";
import type {
  LearningResourceRevision,
  LearningResourceStatus,
  LearningResourceType,
} from "./learning-resource-type";

/**
 * A learning resource in the institutional library — a document, presentation, video,
 * interactive item, external reference or AI-generated material. It carries tags and an
 * optional curriculum mapping (subject + outcomes) for discovery and reuse across lessons, and
 * is version-controlled (a counter plus an append-only revision log). Draft → published →
 * archived; only a published resource is offered for reuse; an archived resource is immutable.
 */
export interface LearningResource {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly resourceType: LearningResourceType;
  readonly description: string | null;
  readonly url: string | null;
  readonly tags: readonly string[];
  readonly subjectId: Uuid | null;
  readonly learningOutcomeIds: readonly Uuid[];
  readonly version: number;
  readonly status: LearningResourceStatus;
  readonly revisions: readonly LearningResourceRevision[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLearningResourceParams {
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

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyLearningResourceFieldError(field);
  }
  return trimmed;
};

const touch = (resource: LearningResource, patch: Partial<LearningResource>): LearningResource => ({
  ...resource,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (resource: LearningResource): void => {
  if (resource.status === "archived") {
    throw new LearningResourceArchivedError(resource.id);
  }
};

/** Create a new draft learning resource at version 1. */
export function createLearningResource(params: CreateLearningResourceParams): LearningResource {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    title: requireText(params.title, "title"),
    resourceType: params.resourceType,
    description: params.description?.trim() || null,
    url: params.url?.trim() || null,
    tags: params.tags ? [...params.tags] : [],
    subjectId: params.subjectId ?? null,
    learningOutcomeIds: params.learningOutcomeIds ? [...params.learningOutcomeIds] : [],
    version: 1,
    status: "draft",
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the resource. Not permitted once archived. */
export function renameLearningResource(
  resource: LearningResource,
  title: string,
): LearningResource {
  assertNotArchived(resource);
  return touch(resource, { title: requireText(title, "title") });
}

/** Set (or clear) the resource description. Not permitted once archived. */
export function setResourceDescription(
  resource: LearningResource,
  description: string | null,
): LearningResource {
  assertNotArchived(resource);
  return touch(resource, { description: description?.trim() || null });
}

/** Set (or clear) the resource location/url. Not permitted once archived. */
export function setResourceUrl(resource: LearningResource, url: string | null): LearningResource {
  assertNotArchived(resource);
  return touch(resource, { url: url?.trim() || null });
}

/** Replace the resource's tags. Not permitted once archived. */
export function setResourceTags(
  resource: LearningResource,
  tags: readonly string[],
): LearningResource {
  assertNotArchived(resource);
  return touch(resource, { tags: [...tags] });
}

/** Replace the resource's curriculum mapping (outcomes). Not permitted once archived. */
export function setResourceOutcomes(
  resource: LearningResource,
  outcomeIds: readonly Uuid[],
): LearningResource {
  assertNotArchived(resource);
  return touch(resource, { learningOutcomeIds: [...outcomeIds] });
}

/** Publish the resource so it is offered for reuse (draft → published). */
export function publishLearningResource(resource: LearningResource): LearningResource {
  assertNotArchived(resource);
  return touch(resource, { status: "published" });
}

/**
 * Revise the resource — bump the version and append to the revision log, keeping its status,
 * so a change to published material is a new known version. Not permitted once archived.
 */
export function reviseLearningResource(resource: LearningResource, note: string): LearningResource {
  assertNotArchived(resource);
  const version = resource.version + 1;
  const revision: LearningResourceRevision = {
    version,
    note: requireText(note, "revision note"),
    revisedAt: nowIso(),
  };
  return touch(resource, { version, revisions: [...resource.revisions, revision] });
}

/** Archive the resource. Terminal — an archived resource is immutable. */
export function archiveLearningResource(resource: LearningResource): LearningResource {
  return touch(resource, { status: "archived" });
}
