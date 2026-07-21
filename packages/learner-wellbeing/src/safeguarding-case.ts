import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptySafeguardingEntryError, SafeguardingCaseResolvedError } from "./errors";
import type {
  ExternalAgencyInvolvement,
  SafeguardingCaseStatus,
  SafeguardingEscalation,
  SafeguardingIncidentReport,
  SafeguardingRiskLevel,
} from "./safeguarding";

/**
 * A safeguarding (child-protection) case for a learner — concern registration, incident
 * reports, risk classification, an investigation-and-escalation workflow, external-agency
 * coordination and resolution tracking. A learner may have more than one case over time,
 * so a case is identified in its own right. The escalation trail makes the case fully
 * traceable. Access is gated behind the most restrictive `safeguarding:*` scope. The
 * learner is a P2-D03 Student; the case derives its organization from the student.
 */
export interface SafeguardingCase {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly concern: string;
  readonly category: string;
  readonly riskLevel: SafeguardingRiskLevel;
  readonly status: SafeguardingCaseStatus;
  readonly reportedBy: Uuid;
  readonly incidentReports: readonly SafeguardingIncidentReport[];
  readonly escalations: readonly SafeguardingEscalation[];
  readonly externalAgencies: readonly ExternalAgencyInvolvement[];
  readonly resolution: string | null;
  readonly openedAt: ISODateString;
  readonly resolvedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenSafeguardingCaseParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly concern: string;
  readonly category: string;
  readonly reportedBy: Uuid;
  readonly riskLevel?: SafeguardingRiskLevel;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptySafeguardingEntryError(field);
  }
  return trimmed;
};

/** Open (register) a new safeguarding case for a learner. */
export function openSafeguardingCase(params: OpenSafeguardingCaseParams): SafeguardingCase {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    concern: requireText(params.concern, "concern"),
    category: requireText(params.category, "category"),
    riskLevel: params.riskLevel ?? "medium",
    status: "reported",
    reportedBy: params.reportedBy,
    incidentReports: [],
    escalations: [],
    externalAgencies: [],
    resolution: null,
    openedAt: now,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (kase: SafeguardingCase, patch: Partial<SafeguardingCase>): SafeguardingCase => ({
  ...kase,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotResolved = (kase: SafeguardingCase): void => {
  if (kase.status === "resolved") {
    throw new SafeguardingCaseResolvedError(kase.id);
  }
};

/** Classify (or re-classify) the risk level. Not permitted once resolved. */
export function classifyRisk(
  kase: SafeguardingCase,
  riskLevel: SafeguardingRiskLevel,
): SafeguardingCase {
  assertNotResolved(kase);
  return touch(kase, { riskLevel });
}

/** Move the case into active investigation. Not permitted once resolved. */
export function beginInvestigation(kase: SafeguardingCase): SafeguardingCase {
  assertNotResolved(kase);
  return touch(kase, { status: "under_investigation" });
}

export interface FileIncidentReportInput {
  readonly description: string;
  readonly reportedBy: Uuid;
  readonly occurredOn?: string;
}

/** File an incident report against the case; returns it. Append-only, not once resolved. */
export function fileIncidentReport(
  kase: SafeguardingCase,
  input: FileIncidentReportInput,
): { kase: SafeguardingCase; report: SafeguardingIncidentReport } {
  assertNotResolved(kase);
  const now = nowIso();
  const report: SafeguardingIncidentReport = {
    id: newUuid(),
    description: requireText(input.description, "incident description"),
    reportedBy: input.reportedBy,
    occurredOn: input.occurredOn?.trim() || now.slice(0, 10),
    reportedAt: now,
  };
  return {
    kase: touch(kase, { incidentReports: [...kase.incidentReports, report] }),
    report,
  };
}

export interface EscalateInput {
  readonly escalatedTo: string;
  readonly reason: string;
  readonly escalatedBy: Uuid;
}

/**
 * Escalate the case to a higher authority; appends to the traceable escalation trail and
 * moves the case into the `escalated` state. Returns the escalation. Not once resolved.
 */
export function escalateSafeguardingCase(
  kase: SafeguardingCase,
  input: EscalateInput,
): { kase: SafeguardingCase; escalation: SafeguardingEscalation } {
  assertNotResolved(kase);
  const escalation: SafeguardingEscalation = {
    id: newUuid(),
    escalatedTo: requireText(input.escalatedTo, "escalation target"),
    reason: requireText(input.reason, "escalation reason"),
    escalatedBy: input.escalatedBy,
    escalatedAt: nowIso(),
  };
  return {
    kase: touch(kase, {
      status: "escalated",
      escalations: [...kase.escalations, escalation],
    }),
    escalation,
  };
}

export interface CoordinateExternalAgencyInput {
  readonly agency: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
}

/** Record coordination with an external agency; returns it. Append-only, not once resolved. */
export function coordinateExternalAgency(
  kase: SafeguardingCase,
  input: CoordinateExternalAgencyInput,
): { kase: SafeguardingCase; involvement: ExternalAgencyInvolvement } {
  assertNotResolved(kase);
  const involvement: ExternalAgencyInvolvement = {
    id: newUuid(),
    agency: requireText(input.agency, "agency"),
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
    involvedAt: nowIso(),
  };
  return {
    kase: touch(kase, { externalAgencies: [...kase.externalAgencies, involvement] }),
    involvement,
  };
}

/** Resolve the case with a resolution. Closing twice errors. */
export function resolveSafeguardingCase(
  kase: SafeguardingCase,
  resolution: string,
): SafeguardingCase {
  assertNotResolved(kase);
  return touch(kase, {
    status: "resolved",
    resolution: requireText(resolution, "resolution"),
    resolvedAt: nowIso(),
  });
}
