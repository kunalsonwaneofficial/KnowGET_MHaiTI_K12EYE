import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { IncidentCategory, IncidentSeverity, IncidentStatus } from "./campus-security-value";
import { OPEN_INCIDENT_STATUSES } from "./campus-security-value";
import {
  EmptyIncidentCodeError,
  EmptyIncidentSummaryError,
  IncidentUnassignedError,
  InvalidIncidentTransitionError,
} from "./errors";

/**
 * A security incident — an operational record of a security/safety event on campus (theft, trespass,
 * vandalism, altercation, hazard, fire, lost/found), at an optional zone, with a category, a severity, an
 * optional reporter (a Person) and an assignee (an Employee — a security officer). It runs `reported →
 * triaged → investigating → resolved → closed`, with `cancelled` reachable from any open state. Investigation
 * requires an assignee. The free-text summary is held on the aggregate and never rides an event. Clinical
 * incidents are the Health Centre's (P2-D19) and the standing safeguarding record is Learner Wellbeing's
 * (P2-D05); this is the operational security log.
 */
export interface SecurityIncident {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly category: IncidentCategory;
  readonly severity: IncidentSeverity;
  readonly zoneId: Uuid | null;
  readonly reportedByPersonId: Uuid | null;
  readonly assigneeId: Uuid | null;
  readonly summary: string;
  readonly reportedOn: string;
  readonly resolvedOn: string | null;
  readonly status: IncidentStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ReportIncidentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly category: IncidentCategory;
  readonly severity: IncidentSeverity;
  readonly zoneId?: Uuid | null;
  readonly reportedByPersonId?: Uuid | null;
  readonly summary: string;
  readonly reportedOn: string;
}

const OPEN: readonly IncidentStatus[] = OPEN_INCIDENT_STATUSES;

/** Whether an incident is still open (non-terminal — reported, triaged or investigating). */
export const isIncidentOpen = (incident: SecurityIncident): boolean =>
  OPEN.includes(incident.status);

/** Report a security incident (status `reported`, unassigned). Code and summary required. */
export function reportIncident(params: ReportIncidentParams): SecurityIncident {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyIncidentCodeError();
  }
  const summary = params.summary.trim();
  if (summary.length === 0) {
    throw new EmptyIncidentSummaryError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    category: params.category,
    severity: params.severity,
    zoneId: params.zoneId ?? null,
    reportedByPersonId: params.reportedByPersonId ?? null,
    assigneeId: null,
    summary,
    reportedOn: params.reportedOn,
    resolvedOn: null,
    status: "reported",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (incident: SecurityIncident, patch: Partial<SecurityIncident>): SecurityIncident => ({
  ...incident,
  ...patch,
  updatedAt: nowIso(),
});

/** Assign an open incident to an employee (officer); keeps the status. */
export function assignIncident(incident: SecurityIncident, assigneeId: Uuid): SecurityIncident {
  if (!isIncidentOpen(incident)) {
    throw new InvalidIncidentTransitionError(incident.status, "assigned");
  }
  return touch(incident, { assigneeId });
}

/** Change the severity of an open incident. */
export function setIncidentSeverity(
  incident: SecurityIncident,
  severity: IncidentSeverity,
): SecurityIncident {
  if (!isIncidentOpen(incident)) {
    throw new InvalidIncidentTransitionError(incident.status, "severity-set");
  }
  return touch(incident, { severity });
}

/** Triage a reported incident (→ `triaged`). */
export function triageIncident(incident: SecurityIncident): SecurityIncident {
  if (incident.status !== "reported") {
    throw new InvalidIncidentTransitionError(incident.status, "triaged");
  }
  return touch(incident, { status: "triaged" });
}

/** Start investigating a triaged incident (→ `investigating`); requires an assignee. */
export function startIncidentInvestigation(incident: SecurityIncident): SecurityIncident {
  if (incident.status !== "triaged") {
    throw new InvalidIncidentTransitionError(incident.status, "investigating");
  }
  if (incident.assigneeId === null) {
    throw new IncidentUnassignedError(incident.id);
  }
  return touch(incident, { status: "investigating" });
}

/** Resolve an investigating incident (→ `resolved`, recording the resolution date). */
export function resolveIncident(incident: SecurityIncident, resolvedOn: string): SecurityIncident {
  if (incident.status !== "investigating") {
    throw new InvalidIncidentTransitionError(incident.status, "resolved");
  }
  return touch(incident, { status: "resolved", resolvedOn });
}

/** Close a resolved incident (→ `closed`, terminal). */
export function closeIncident(incident: SecurityIncident): SecurityIncident {
  if (incident.status !== "resolved") {
    throw new InvalidIncidentTransitionError(incident.status, "closed");
  }
  return touch(incident, { status: "closed" });
}

/** Cancel an open incident (→ `cancelled`, terminal). */
export function cancelIncident(incident: SecurityIncident): SecurityIncident {
  if (!isIncidentOpen(incident)) {
    throw new InvalidIncidentTransitionError(incident.status, "cancelled");
  }
  return touch(incident, { status: "cancelled" });
}
