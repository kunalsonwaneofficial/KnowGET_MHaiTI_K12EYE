import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Organization, OrganizationStatus } from "./organization";

export const ORGANIZATION_CREATED = "organization.created";
export const ORGANIZATION_RENAMED = "organization.renamed";
export const ORGANIZATION_MOVED = "organization.moved";
export const ORGANIZATION_STATUS_CHANGED = "organization.status_changed";

export interface OrganizationCreatedPayload {
  readonly organizationId: Uuid;
  readonly type: string;
  readonly code: string;
  readonly name: string;
  readonly parentId: Uuid | null;
}
export interface OrganizationRenamedPayload {
  readonly organizationId: Uuid;
  readonly name: string;
}
export interface OrganizationMovedPayload {
  readonly organizationId: Uuid;
  readonly parentId: Uuid | null;
}
export interface OrganizationStatusChangedPayload {
  readonly organizationId: Uuid;
  readonly from: OrganizationStatus;
  readonly to: OrganizationStatus;
}

export type OrganizationCreatedEvent = DomainEvent<
  typeof ORGANIZATION_CREATED,
  OrganizationCreatedPayload
>;
export type OrganizationRenamedEvent = DomainEvent<
  typeof ORGANIZATION_RENAMED,
  OrganizationRenamedPayload
>;
export type OrganizationMovedEvent = DomainEvent<
  typeof ORGANIZATION_MOVED,
  OrganizationMovedPayload
>;
export type OrganizationStatusChangedEvent = DomainEvent<
  typeof ORGANIZATION_STATUS_CHANGED,
  OrganizationStatusChangedPayload
>;

export const organizationCreated = (organization: Organization): OrganizationCreatedEvent =>
  createEvent(
    ORGANIZATION_CREATED,
    {
      organizationId: organization.id,
      type: organization.type,
      code: organization.code,
      name: organization.name,
      parentId: organization.parentId,
    },
    { tenantId: organization.tenantId },
  );

export const organizationRenamed = (organization: Organization): OrganizationRenamedEvent =>
  createEvent(
    ORGANIZATION_RENAMED,
    { organizationId: organization.id, name: organization.name },
    { tenantId: organization.tenantId },
  );

export const organizationMoved = (organization: Organization): OrganizationMovedEvent =>
  createEvent(
    ORGANIZATION_MOVED,
    { organizationId: organization.id, parentId: organization.parentId },
    { tenantId: organization.tenantId },
  );

export const organizationStatusChanged = (
  organization: Organization,
  from: OrganizationStatus,
): OrganizationStatusChangedEvent =>
  createEvent(
    ORGANIZATION_STATUS_CHANGED,
    { organizationId: organization.id, from, to: organization.status },
    { tenantId: organization.tenantId },
  );
