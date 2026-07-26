import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AccessZone } from "./access-zone";
import type { Visitor } from "./visitor";

/**
 * Domain events for the Campus Security, Safety & Visitor Platform (P2-D21), on the `campus-security.*`
 * namespace (distinct from the platform `@knowget/security` infrastructure). Payloads carry ids,
 * non-sensitive metadata (a code, a type, a level, a status, a severity, a decision) and counts — never
 * money, never a visitor's name or contact details, never an incident's free-text summary.
 */

// --- Access zone -----------------------------------------------------------------
export const ZONE_CREATED = "campus-security.zone.created";
export const ZONE_RENAMED = "campus-security.zone.renamed";
export const ZONE_SECURITY_LEVEL_SET = "campus-security.zone.security_level_set";
export const ZONE_CAPACITY_SET = "campus-security.zone.capacity_set";
export const ZONE_LOCKED_DOWN = "campus-security.zone.locked_down";
export const ZONE_LOCKDOWN_LIFTED = "campus-security.zone.lockdown_lifted";
export const ZONE_DECOMMISSIONED = "campus-security.zone.decommissioned";

export interface ZoneEventPayload {
  readonly zoneId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly securityLevel: string;
  readonly capacity: number;
  readonly status: string;
}

export type ZoneCreatedEvent = DomainEvent<typeof ZONE_CREATED, ZoneEventPayload>;
export type ZoneRenamedEvent = DomainEvent<typeof ZONE_RENAMED, ZoneEventPayload>;
export type ZoneSecurityLevelSetEvent = DomainEvent<
  typeof ZONE_SECURITY_LEVEL_SET,
  ZoneEventPayload
>;
export type ZoneCapacitySetEvent = DomainEvent<typeof ZONE_CAPACITY_SET, ZoneEventPayload>;
export type ZoneLockedDownEvent = DomainEvent<typeof ZONE_LOCKED_DOWN, ZoneEventPayload>;
export type ZoneLockdownLiftedEvent = DomainEvent<typeof ZONE_LOCKDOWN_LIFTED, ZoneEventPayload>;
export type ZoneDecommissionedEvent = DomainEvent<typeof ZONE_DECOMMISSIONED, ZoneEventPayload>;

const zonePayload = (zone: AccessZone): ZoneEventPayload => ({
  zoneId: zone.id,
  organizationId: zone.organizationId,
  code: zone.code,
  securityLevel: zone.securityLevel,
  capacity: zone.capacity,
  status: zone.status,
});

export const zoneCreated = (zone: AccessZone): ZoneCreatedEvent =>
  createEvent(ZONE_CREATED, zonePayload(zone), { tenantId: zone.tenantId });
export const zoneRenamed = (zone: AccessZone): ZoneRenamedEvent =>
  createEvent(ZONE_RENAMED, zonePayload(zone), { tenantId: zone.tenantId });
export const zoneSecurityLevelSet = (zone: AccessZone): ZoneSecurityLevelSetEvent =>
  createEvent(ZONE_SECURITY_LEVEL_SET, zonePayload(zone), { tenantId: zone.tenantId });
export const zoneCapacitySet = (zone: AccessZone): ZoneCapacitySetEvent =>
  createEvent(ZONE_CAPACITY_SET, zonePayload(zone), { tenantId: zone.tenantId });
export const zoneLockedDown = (zone: AccessZone): ZoneLockedDownEvent =>
  createEvent(ZONE_LOCKED_DOWN, zonePayload(zone), { tenantId: zone.tenantId });
export const zoneLockdownLifted = (zone: AccessZone): ZoneLockdownLiftedEvent =>
  createEvent(ZONE_LOCKDOWN_LIFTED, zonePayload(zone), { tenantId: zone.tenantId });
export const zoneDecommissioned = (zone: AccessZone): ZoneDecommissionedEvent =>
  createEvent(ZONE_DECOMMISSIONED, zonePayload(zone), { tenantId: zone.tenantId });

// --- Visitor ---------------------------------------------------------------------
export const VISITOR_REGISTERED = "campus-security.visitor.registered";
export const VISITOR_TYPE_SET = "campus-security.visitor.type_set";
export const VISITOR_CONTACT_UPDATED = "campus-security.visitor.contact_updated";
export const VISITOR_BLOCKED = "campus-security.visitor.blocked";
export const VISITOR_UNBLOCKED = "campus-security.visitor.unblocked";
export const VISITOR_ARCHIVED = "campus-security.visitor.archived";

export interface VisitorEventPayload {
  readonly visitorId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly type: string;
  readonly status: string;
}

export type VisitorRegisteredEvent = DomainEvent<typeof VISITOR_REGISTERED, VisitorEventPayload>;
export type VisitorTypeSetEvent = DomainEvent<typeof VISITOR_TYPE_SET, VisitorEventPayload>;
export type VisitorContactUpdatedEvent = DomainEvent<
  typeof VISITOR_CONTACT_UPDATED,
  VisitorEventPayload
>;
export type VisitorBlockedEvent = DomainEvent<typeof VISITOR_BLOCKED, VisitorEventPayload>;
export type VisitorUnblockedEvent = DomainEvent<typeof VISITOR_UNBLOCKED, VisitorEventPayload>;
export type VisitorArchivedEvent = DomainEvent<typeof VISITOR_ARCHIVED, VisitorEventPayload>;

const visitorPayload = (visitor: Visitor): VisitorEventPayload => ({
  visitorId: visitor.id,
  organizationId: visitor.organizationId,
  code: visitor.code,
  type: visitor.type,
  status: visitor.status,
});

export const visitorRegistered = (visitor: Visitor): VisitorRegisteredEvent =>
  createEvent(VISITOR_REGISTERED, visitorPayload(visitor), { tenantId: visitor.tenantId });
export const visitorTypeSet = (visitor: Visitor): VisitorTypeSetEvent =>
  createEvent(VISITOR_TYPE_SET, visitorPayload(visitor), { tenantId: visitor.tenantId });
export const visitorContactUpdated = (visitor: Visitor): VisitorContactUpdatedEvent =>
  createEvent(VISITOR_CONTACT_UPDATED, visitorPayload(visitor), { tenantId: visitor.tenantId });
export const visitorBlocked = (visitor: Visitor): VisitorBlockedEvent =>
  createEvent(VISITOR_BLOCKED, visitorPayload(visitor), { tenantId: visitor.tenantId });
export const visitorUnblocked = (visitor: Visitor): VisitorUnblockedEvent =>
  createEvent(VISITOR_UNBLOCKED, visitorPayload(visitor), { tenantId: visitor.tenantId });
export const visitorArchived = (visitor: Visitor): VisitorArchivedEvent =>
  createEvent(VISITOR_ARCHIVED, visitorPayload(visitor), { tenantId: visitor.tenantId });
