import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  BehaviourGoalNotFoundError,
  BehaviourIncidentNotFoundError,
  BehaviourObservationNotFoundError,
  EmptyBehaviourEntryError,
  RestorativeActionNotFoundError,
} from "./errors";
import type {
  BehaviourGoal,
  BehaviourGoalStatus,
  BehaviourImprovementPlan,
  BehaviourIncident,
  BehaviourIncidentSeverity,
  BehaviourIncidentStatus,
  BehaviourObservation,
  BehaviourObservationType,
  RestorativeAction,
} from "./behaviour";

/**
 * A learner's behaviour record — the complete, auditable history of positive
 * recognitions, observations, incidents (with their restorative actions), developmental
 * goals and an improvement plan. One per student. The model deliberately leads with
 * development over punishment. The learner is a P2-D03 Student; the record derives its
 * organization from the student.
 */
export interface BehaviourRecord {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly observations: readonly BehaviourObservation[];
  readonly incidents: readonly BehaviourIncident[];
  readonly goals: readonly BehaviourGoal[];
  readonly improvementPlan: BehaviourImprovementPlan | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateBehaviourRecordParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

/** Create a new, empty behaviour record for a learner. */
export function createBehaviourRecord(params: CreateBehaviourRecordParams): BehaviourRecord {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    observations: [],
    incidents: [],
    goals: [],
    improvementPlan: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (record: BehaviourRecord, patch: Partial<BehaviourRecord>): BehaviourRecord => ({
  ...record,
  ...patch,
  updatedAt: nowIso(),
});

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyBehaviourEntryError(field);
  }
  return trimmed;
};

export interface RecordObservationInput {
  readonly type: BehaviourObservationType;
  readonly note: string;
  readonly observedBy: Uuid;
  readonly observedAt?: ISODateString;
}

/** Record a behaviour observation (positive, neutral or concern); returns it. */
export function recordObservation(
  record: BehaviourRecord,
  input: RecordObservationInput,
): { record: BehaviourRecord; observation: BehaviourObservation } {
  const observation: BehaviourObservation = {
    id: newUuid(),
    type: input.type,
    note: requireText(input.note, "note"),
    observedBy: input.observedBy,
    observedAt: input.observedAt ?? nowIso(),
  };
  return {
    record: touch(record, { observations: [...record.observations, observation] }),
    observation,
  };
}

/** Remove a behaviour observation by id. */
export function removeObservation(record: BehaviourRecord, observationId: Uuid): BehaviourRecord {
  if (!record.observations.some((o) => o.id === observationId)) {
    throw new BehaviourObservationNotFoundError(observationId);
  }
  return touch(record, {
    observations: record.observations.filter((o) => o.id !== observationId),
  });
}

export interface ReportIncidentInput {
  readonly category: string;
  readonly severity: BehaviourIncidentSeverity;
  readonly description: string;
  readonly reportedBy: Uuid;
  readonly reportedAt?: ISODateString;
}

/** Report a behaviour incident; returns it. */
export function reportIncident(
  record: BehaviourRecord,
  input: ReportIncidentInput,
): { record: BehaviourRecord; incident: BehaviourIncident } {
  const incident: BehaviourIncident = {
    id: newUuid(),
    category: requireText(input.category, "category"),
    severity: input.severity,
    description: requireText(input.description, "description"),
    reportedBy: input.reportedBy,
    reportedAt: input.reportedAt ?? nowIso(),
    status: "reported",
    restorativeActions: [],
  };
  return {
    record: touch(record, { incidents: [...record.incidents, incident] }),
    incident,
  };
}

const mapIncident = (
  record: BehaviourRecord,
  incidentId: Uuid,
  fn: (incident: BehaviourIncident) => BehaviourIncident,
): BehaviourRecord => {
  if (!record.incidents.some((i) => i.id === incidentId)) {
    throw new BehaviourIncidentNotFoundError(incidentId);
  }
  return touch(record, {
    incidents: record.incidents.map((i) => (i.id === incidentId ? fn(i) : i)),
  });
};

/** Move an incident through its review lifecycle. */
export function updateIncidentStatus(
  record: BehaviourRecord,
  incidentId: Uuid,
  status: BehaviourIncidentStatus,
): BehaviourRecord {
  return mapIncident(record, incidentId, (i) => ({ ...i, status }));
}

/** Attach a restorative action to an incident; returns the new action. */
export function addRestorativeAction(
  record: BehaviourRecord,
  incidentId: Uuid,
  description: string,
): { record: BehaviourRecord; action: RestorativeAction } {
  const action: RestorativeAction = {
    id: newUuid(),
    description: requireText(description, "restorative action"),
    completedAt: null,
  };
  const updated = mapIncident(record, incidentId, (i) => ({
    ...i,
    restorativeActions: [...i.restorativeActions, action],
  }));
  return { record: updated, action };
}

/** Mark a restorative action complete. */
export function completeRestorativeAction(
  record: BehaviourRecord,
  incidentId: Uuid,
  actionId: Uuid,
  completedAt?: ISODateString,
): BehaviourRecord {
  const when = completedAt ?? nowIso();
  return mapIncident(record, incidentId, (incident) => {
    if (!incident.restorativeActions.some((a) => a.id === actionId)) {
      throw new RestorativeActionNotFoundError(actionId);
    }
    return {
      ...incident,
      restorativeActions: incident.restorativeActions.map((a) =>
        a.id === actionId ? { ...a, completedAt: when } : a,
      ),
    };
  });
}

/** Set a developmental behaviour goal; returns it. */
export function setBehaviourGoal(
  record: BehaviourRecord,
  description: string,
): { record: BehaviourRecord; goal: BehaviourGoal } {
  const goal: BehaviourGoal = {
    id: newUuid(),
    description: requireText(description, "goal description"),
    status: "active",
    setAt: nowIso(),
  };
  return { record: touch(record, { goals: [...record.goals, goal] }), goal };
}

/** Update a behaviour goal's status (achieved/abandoned/active). */
export function updateBehaviourGoalStatus(
  record: BehaviourRecord,
  goalId: Uuid,
  status: BehaviourGoalStatus,
): BehaviourRecord {
  if (!record.goals.some((g) => g.id === goalId)) {
    throw new BehaviourGoalNotFoundError(goalId);
  }
  return touch(record, {
    goals: record.goals.map((g) => (g.id === goalId ? { ...g, status } : g)),
  });
}

/** Remove a behaviour goal by id. */
export function removeBehaviourGoal(record: BehaviourRecord, goalId: Uuid): BehaviourRecord {
  if (!record.goals.some((g) => g.id === goalId)) {
    throw new BehaviourGoalNotFoundError(goalId);
  }
  return touch(record, { goals: record.goals.filter((g) => g.id !== goalId) });
}

export interface SetImprovementPlanInput {
  readonly strategies: readonly string[];
  readonly reviewOn?: string | null;
  readonly notes?: string | null;
}

/** Set (or replace) the behaviour improvement plan. */
export function setImprovementPlan(
  record: BehaviourRecord,
  input: SetImprovementPlanInput,
): BehaviourRecord {
  const strategies = [
    ...new Set(input.strategies.map((s) => s.trim()).filter((s) => s.length > 0)),
  ];
  const plan: BehaviourImprovementPlan = {
    strategies,
    reviewOn: input.reviewOn?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  return touch(record, { improvementPlan: plan });
}

/** Clear the behaviour improvement plan. */
export function clearImprovementPlan(record: BehaviourRecord): BehaviourRecord {
  return touch(record, { improvementPlan: null });
}
