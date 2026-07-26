import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AccessCredential } from "./access-credential";
import type { AccessEvent } from "./access-event";
import type { AccessZone } from "./access-zone";
import type { SecurityIncident } from "./security-incident";
import type { Visit } from "./visit";
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

// --- Visit -----------------------------------------------------------------------
export const VISIT_REQUESTED = "campus-security.visit.requested";
export const VISIT_ZONE_SET = "campus-security.visit.zone_set";
export const VISIT_APPROVED = "campus-security.visit.approved";
export const VISIT_DENIED = "campus-security.visit.denied";
export const VISIT_CHECKED_IN = "campus-security.visit.checked_in";
export const VISIT_CHECKED_OUT = "campus-security.visit.checked_out";
export const VISIT_CANCELLED = "campus-security.visit.cancelled";
export const VISIT_EXPIRED = "campus-security.visit.expired";

export interface VisitEventPayload {
  readonly visitId: Uuid;
  readonly organizationId: Uuid;
  readonly visitorId: Uuid;
  readonly hostPersonId: Uuid;
  readonly zoneId: Uuid | null;
  readonly status: string;
}

export type VisitRequestedEvent = DomainEvent<typeof VISIT_REQUESTED, VisitEventPayload>;
export type VisitZoneSetEvent = DomainEvent<typeof VISIT_ZONE_SET, VisitEventPayload>;
export type VisitApprovedEvent = DomainEvent<typeof VISIT_APPROVED, VisitEventPayload>;
export type VisitDeniedEvent = DomainEvent<typeof VISIT_DENIED, VisitEventPayload>;
export type VisitCheckedInEvent = DomainEvent<typeof VISIT_CHECKED_IN, VisitEventPayload>;
export type VisitCheckedOutEvent = DomainEvent<typeof VISIT_CHECKED_OUT, VisitEventPayload>;
export type VisitCancelledEvent = DomainEvent<typeof VISIT_CANCELLED, VisitEventPayload>;
export type VisitExpiredEvent = DomainEvent<typeof VISIT_EXPIRED, VisitEventPayload>;

const visitPayload = (visit: Visit): VisitEventPayload => ({
  visitId: visit.id,
  organizationId: visit.organizationId,
  visitorId: visit.visitorId,
  hostPersonId: visit.hostPersonId,
  zoneId: visit.zoneId,
  status: visit.status,
});

export const visitRequested = (visit: Visit): VisitRequestedEvent =>
  createEvent(VISIT_REQUESTED, visitPayload(visit), { tenantId: visit.tenantId });
export const visitZoneSet = (visit: Visit): VisitZoneSetEvent =>
  createEvent(VISIT_ZONE_SET, visitPayload(visit), { tenantId: visit.tenantId });
export const visitApproved = (visit: Visit): VisitApprovedEvent =>
  createEvent(VISIT_APPROVED, visitPayload(visit), { tenantId: visit.tenantId });
export const visitDenied = (visit: Visit): VisitDeniedEvent =>
  createEvent(VISIT_DENIED, visitPayload(visit), { tenantId: visit.tenantId });
export const visitCheckedIn = (visit: Visit): VisitCheckedInEvent =>
  createEvent(VISIT_CHECKED_IN, visitPayload(visit), { tenantId: visit.tenantId });
export const visitCheckedOut = (visit: Visit): VisitCheckedOutEvent =>
  createEvent(VISIT_CHECKED_OUT, visitPayload(visit), { tenantId: visit.tenantId });
export const visitCancelled = (visit: Visit): VisitCancelledEvent =>
  createEvent(VISIT_CANCELLED, visitPayload(visit), { tenantId: visit.tenantId });
export const visitExpired = (visit: Visit): VisitExpiredEvent =>
  createEvent(VISIT_EXPIRED, visitPayload(visit), { tenantId: visit.tenantId });

// --- Access credential -----------------------------------------------------------
export const CREDENTIAL_ISSUED = "campus-security.credential.issued";
export const CREDENTIAL_ZONE_GRANTED = "campus-security.credential.zone_granted";
export const CREDENTIAL_ZONE_REVOKED = "campus-security.credential.zone_revoked";
export const CREDENTIAL_EXPIRY_SET = "campus-security.credential.expiry_set";
export const CREDENTIAL_SUSPENDED = "campus-security.credential.suspended";
export const CREDENTIAL_REINSTATED = "campus-security.credential.reinstated";
export const CREDENTIAL_REVOKED = "campus-security.credential.revoked";

export interface CredentialEventPayload {
  readonly credentialId: Uuid;
  readonly organizationId: Uuid;
  readonly holderType: string;
  readonly holderId: Uuid;
  readonly status: string;
  readonly zoneCount: number;
}

export type CredentialIssuedEvent = DomainEvent<typeof CREDENTIAL_ISSUED, CredentialEventPayload>;
export type CredentialZoneGrantedEvent = DomainEvent<
  typeof CREDENTIAL_ZONE_GRANTED,
  CredentialEventPayload
>;
export type CredentialZoneRevokedEvent = DomainEvent<
  typeof CREDENTIAL_ZONE_REVOKED,
  CredentialEventPayload
>;
export type CredentialExpirySetEvent = DomainEvent<
  typeof CREDENTIAL_EXPIRY_SET,
  CredentialEventPayload
>;
export type CredentialSuspendedEvent = DomainEvent<
  typeof CREDENTIAL_SUSPENDED,
  CredentialEventPayload
>;
export type CredentialReinstatedEvent = DomainEvent<
  typeof CREDENTIAL_REINSTATED,
  CredentialEventPayload
>;
export type CredentialRevokedEvent = DomainEvent<typeof CREDENTIAL_REVOKED, CredentialEventPayload>;

const credentialPayload = (credential: AccessCredential): CredentialEventPayload => ({
  credentialId: credential.id,
  organizationId: credential.organizationId,
  holderType: credential.holderType,
  holderId: credential.holderId,
  status: credential.status,
  zoneCount: credential.grantedZoneIds.length,
});

export const credentialIssued = (credential: AccessCredential): CredentialIssuedEvent =>
  createEvent(CREDENTIAL_ISSUED, credentialPayload(credential), { tenantId: credential.tenantId });
export const credentialZoneGranted = (credential: AccessCredential): CredentialZoneGrantedEvent =>
  createEvent(CREDENTIAL_ZONE_GRANTED, credentialPayload(credential), {
    tenantId: credential.tenantId,
  });
export const credentialZoneRevoked = (credential: AccessCredential): CredentialZoneRevokedEvent =>
  createEvent(CREDENTIAL_ZONE_REVOKED, credentialPayload(credential), {
    tenantId: credential.tenantId,
  });
export const credentialExpirySet = (credential: AccessCredential): CredentialExpirySetEvent =>
  createEvent(CREDENTIAL_EXPIRY_SET, credentialPayload(credential), {
    tenantId: credential.tenantId,
  });
export const credentialSuspended = (credential: AccessCredential): CredentialSuspendedEvent =>
  createEvent(CREDENTIAL_SUSPENDED, credentialPayload(credential), {
    tenantId: credential.tenantId,
  });
export const credentialReinstated = (credential: AccessCredential): CredentialReinstatedEvent =>
  createEvent(CREDENTIAL_REINSTATED, credentialPayload(credential), {
    tenantId: credential.tenantId,
  });
export const credentialRevoked = (credential: AccessCredential): CredentialRevokedEvent =>
  createEvent(CREDENTIAL_REVOKED, credentialPayload(credential), {
    tenantId: credential.tenantId,
  });

// --- Access event ----------------------------------------------------------------
export const ACCESS_RECORDED = "campus-security.access.recorded";

export interface AccessEventPayload {
  readonly eventId: Uuid;
  readonly organizationId: Uuid;
  readonly credentialId: Uuid;
  readonly zoneId: Uuid;
  readonly decision: string;
  readonly reason: string;
  readonly occurredAt: string;
}

export type AccessRecordedEvent = DomainEvent<typeof ACCESS_RECORDED, AccessEventPayload>;

const accessPayload = (event: AccessEvent): AccessEventPayload => ({
  eventId: event.id,
  organizationId: event.organizationId,
  credentialId: event.credentialId,
  zoneId: event.zoneId,
  decision: event.decision,
  reason: event.reason,
  occurredAt: event.occurredAt,
});

export const accessRecorded = (event: AccessEvent): AccessRecordedEvent =>
  createEvent(ACCESS_RECORDED, accessPayload(event), { tenantId: event.tenantId });

// --- Security incident -----------------------------------------------------------
export const INCIDENT_REPORTED = "campus-security.incident.reported";
export const INCIDENT_TRIAGED = "campus-security.incident.triaged";
export const INCIDENT_ASSIGNED = "campus-security.incident.assigned";
export const INCIDENT_SEVERITY_SET = "campus-security.incident.severity_set";
export const INCIDENT_INVESTIGATION_STARTED = "campus-security.incident.investigation_started";
export const INCIDENT_RESOLVED = "campus-security.incident.resolved";
export const INCIDENT_CLOSED = "campus-security.incident.closed";
export const INCIDENT_CANCELLED = "campus-security.incident.cancelled";

export interface IncidentEventPayload {
  readonly incidentId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly category: string;
  readonly severity: string;
  readonly zoneId: Uuid | null;
  readonly assigneeId: Uuid | null;
  readonly status: string;
}

export type IncidentReportedEvent = DomainEvent<typeof INCIDENT_REPORTED, IncidentEventPayload>;
export type IncidentTriagedEvent = DomainEvent<typeof INCIDENT_TRIAGED, IncidentEventPayload>;
export type IncidentAssignedEvent = DomainEvent<typeof INCIDENT_ASSIGNED, IncidentEventPayload>;
export type IncidentSeveritySetEvent = DomainEvent<
  typeof INCIDENT_SEVERITY_SET,
  IncidentEventPayload
>;
export type IncidentInvestigationStartedEvent = DomainEvent<
  typeof INCIDENT_INVESTIGATION_STARTED,
  IncidentEventPayload
>;
export type IncidentResolvedEvent = DomainEvent<typeof INCIDENT_RESOLVED, IncidentEventPayload>;
export type IncidentClosedEvent = DomainEvent<typeof INCIDENT_CLOSED, IncidentEventPayload>;
export type IncidentCancelledEvent = DomainEvent<typeof INCIDENT_CANCELLED, IncidentEventPayload>;

const incidentPayload = (incident: SecurityIncident): IncidentEventPayload => ({
  incidentId: incident.id,
  organizationId: incident.organizationId,
  code: incident.code,
  category: incident.category,
  severity: incident.severity,
  zoneId: incident.zoneId,
  assigneeId: incident.assigneeId,
  status: incident.status,
});

export const incidentReported = (incident: SecurityIncident): IncidentReportedEvent =>
  createEvent(INCIDENT_REPORTED, incidentPayload(incident), { tenantId: incident.tenantId });
export const incidentTriaged = (incident: SecurityIncident): IncidentTriagedEvent =>
  createEvent(INCIDENT_TRIAGED, incidentPayload(incident), { tenantId: incident.tenantId });
export const incidentAssigned = (incident: SecurityIncident): IncidentAssignedEvent =>
  createEvent(INCIDENT_ASSIGNED, incidentPayload(incident), { tenantId: incident.tenantId });
export const incidentSeveritySet = (incident: SecurityIncident): IncidentSeveritySetEvent =>
  createEvent(INCIDENT_SEVERITY_SET, incidentPayload(incident), { tenantId: incident.tenantId });
export const incidentInvestigationStarted = (
  incident: SecurityIncident,
): IncidentInvestigationStartedEvent =>
  createEvent(INCIDENT_INVESTIGATION_STARTED, incidentPayload(incident), {
    tenantId: incident.tenantId,
  });
export const incidentResolved = (incident: SecurityIncident): IncidentResolvedEvent =>
  createEvent(INCIDENT_RESOLVED, incidentPayload(incident), { tenantId: incident.tenantId });
export const incidentClosed = (incident: SecurityIncident): IncidentClosedEvent =>
  createEvent(INCIDENT_CLOSED, incidentPayload(incident), { tenantId: incident.tenantId });
export const incidentCancelled = (incident: SecurityIncident): IncidentCancelledEvent =>
  createEvent(INCIDENT_CANCELLED, incidentPayload(incident), { tenantId: incident.tenantId });
