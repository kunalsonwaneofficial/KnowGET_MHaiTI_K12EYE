import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyInterventionEntryError,
  InterventionNotFoundError,
  InterventionNotOpenError,
} from "./errors";
import type { Intervention, InterventionProgressNote } from "./intervention";

/**
 * A learner's intervention plan — early-warning triggers and the set of assigned
 * interventions, each with responsible staff, progress monitoring and an outcome
 * evaluation. One per student. Prediction is out of scope; this domain records the
 * triggers institutions define and the interventions they run. The learner is a P2-D03
 * Student; the plan derives its organization from the student.
 */
export interface InterventionPlan {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly earlyWarningTriggers: readonly string[];
  readonly interventions: readonly Intervention[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateInterventionPlanParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
}

/** Create a new, empty intervention plan for a learner. */
export function createInterventionPlan(params: CreateInterventionPlanParams): InterventionPlan {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    earlyWarningTriggers: [],
    interventions: [],
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (plan: InterventionPlan, patch: Partial<InterventionPlan>): InterventionPlan => ({
  ...plan,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the early-warning triggers (trimmed, non-empty, deduplicated). */
export const setEarlyWarningTriggers = (
  plan: InterventionPlan,
  triggers: readonly string[],
): InterventionPlan =>
  touch(plan, {
    earlyWarningTriggers: [...new Set(triggers.map((t) => t.trim()).filter((t) => t.length > 0))],
  });

export interface AssignInterventionInput {
  readonly description: string;
  readonly responsibleStaff: Uuid;
}

/** Assign a new intervention to the plan; returns it. */
export function assignIntervention(
  plan: InterventionPlan,
  input: AssignInterventionInput,
): { plan: InterventionPlan; intervention: Intervention } {
  const description = input.description.trim();
  if (description.length === 0) {
    throw new EmptyInterventionEntryError("intervention description");
  }
  const intervention: Intervention = {
    id: newUuid(),
    description,
    responsibleStaff: input.responsibleStaff,
    status: "assigned",
    progressNotes: [],
    outcome: null,
    assignedAt: nowIso(),
    completedAt: null,
  };
  return {
    plan: touch(plan, { interventions: [...plan.interventions, intervention] }),
    intervention,
  };
}

const mapIntervention = (
  plan: InterventionPlan,
  interventionId: Uuid,
  fn: (intervention: Intervention) => Intervention,
): InterventionPlan => {
  if (!plan.interventions.some((i) => i.id === interventionId)) {
    throw new InterventionNotFoundError(interventionId);
  }
  return touch(plan, {
    interventions: plan.interventions.map((i) => (i.id === interventionId ? fn(i) : i)),
  });
};

const assertOpen = (intervention: Intervention): void => {
  if (intervention.status === "completed" || intervention.status === "cancelled") {
    throw new InterventionNotOpenError(intervention.id);
  }
};

/** Move an intervention into active progress. */
export function startIntervention(plan: InterventionPlan, interventionId: Uuid): InterventionPlan {
  return mapIntervention(plan, interventionId, (i) => {
    assertOpen(i);
    return { ...i, status: "in_progress" };
  });
}

export interface RecordProgressInput {
  readonly note: string;
  readonly recordedBy: Uuid;
}

/** Record a progress-monitoring note on an intervention; returns the note. */
export function recordInterventionProgress(
  plan: InterventionPlan,
  interventionId: Uuid,
  input: RecordProgressInput,
): { plan: InterventionPlan; note: InterventionProgressNote } {
  const note: InterventionProgressNote = {
    id: newUuid(),
    note: input.note.trim(),
    recordedBy: input.recordedBy,
    recordedAt: nowIso(),
  };
  if (note.note.length === 0) {
    throw new EmptyInterventionEntryError("progress note");
  }
  const updated = mapIntervention(plan, interventionId, (i) => {
    assertOpen(i);
    return { ...i, progressNotes: [...i.progressNotes, note] };
  });
  return { plan: updated, note };
}

/** Complete an intervention with an outcome evaluation. */
export function completeIntervention(
  plan: InterventionPlan,
  interventionId: Uuid,
  outcome: string,
): { plan: InterventionPlan; intervention: Intervention } {
  const evaluated = outcome.trim();
  if (evaluated.length === 0) {
    throw new EmptyInterventionEntryError("outcome");
  }
  let completed: Intervention | undefined;
  const updated = mapIntervention(plan, interventionId, (i) => {
    assertOpen(i);
    completed = {
      ...i,
      status: "completed",
      outcome: evaluated,
      completedAt: nowIso(),
    };
    return completed;
  });
  return { plan: updated, intervention: completed as Intervention };
}

/** Cancel an intervention (no outcome). */
export function cancelIntervention(plan: InterventionPlan, interventionId: Uuid): InterventionPlan {
  return mapIntervention(plan, interventionId, (i) => {
    assertOpen(i);
    return { ...i, status: "cancelled", completedAt: nowIso() };
  });
}
