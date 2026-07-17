import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";

/** Audit metadata carried by every persisted entity. */
export interface AuditMetadata {
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly createdBy?: Uuid;
  readonly updatedBy?: Uuid;
  readonly correlationId?: CorrelationId;
}

/** Entities that support soft deletion. */
export interface SoftDeletable {
  readonly deletedAt?: ISODateString | null;
}

/** Entities owned by (isolated to) a tenant. */
export interface TenantOwned {
  readonly tenantId: TenantId;
}

/** Base shape for a persisted aggregate. */
export interface BaseEntity extends AuditMetadata, SoftDeletable {
  readonly id: Uuid;
}

/** True when a soft-deletable entity is currently deleted. */
export const isDeleted = (entity: SoftDeletable): boolean =>
  entity.deletedAt !== undefined && entity.deletedAt !== null;
