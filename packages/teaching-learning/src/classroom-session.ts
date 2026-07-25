import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ClassroomSessionStatus, ParticipationSummary } from "./classroom-session-value";
import { ClassroomSessionStateError, EmptyClassroomSessionFieldError } from "./errors";

/**
 * The delivery of a scheduled instructional session — the bridge between the lesson plan and
 * what actually happened. It captures the planned topics, then (on delivery) the actual topics
 * covered, activities completed, resources used, a lightweight participation summary and the
 * teacher's reflections. Scheduled → delivered → completed, or cancelled. Attendance recording
 * is a Presence-platform (P2-D08) concern and an explicit non-goal; participation here is only
 * a descriptive engagement note. Structurally satisfies the intelligence engine's session view.
 */
export interface ClassroomSession {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly scheduleSlotId: Uuid | null;
  readonly lessonPlanId: Uuid | null;
  readonly sectionId: Uuid | null;
  readonly subjectId: Uuid | null;
  readonly title: string;
  readonly date: string;
  readonly plannedTopics: readonly string[];
  readonly actualTopicsCovered: readonly string[];
  readonly activitiesCompleted: readonly string[];
  readonly resourcesUsedIds: readonly Uuid[];
  readonly participation: ParticipationSummary | null;
  readonly teacherReflections: string | null;
  readonly status: ClassroomSessionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateClassroomSessionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly date: string;
  readonly scheduleSlotId?: Uuid | null;
  readonly lessonPlanId?: Uuid | null;
  readonly sectionId?: Uuid | null;
  readonly subjectId?: Uuid | null;
  readonly plannedTopics?: readonly string[];
}

/** The actual-delivery data recorded when a session is delivered (or amended afterwards). */
export interface SessionDelivery {
  readonly actualTopicsCovered?: readonly string[];
  readonly activitiesCompleted?: readonly string[];
  readonly resourcesUsedIds?: readonly Uuid[];
  readonly participation?: ParticipationSummary | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyClassroomSessionFieldError(field);
  }
  return trimmed;
};

const touch = (session: ClassroomSession, patch: Partial<ClassroomSession>): ClassroomSession => ({
  ...session,
  ...patch,
  updatedAt: nowIso(),
});

const applyDelivery = (
  session: ClassroomSession,
  delivery: SessionDelivery,
): Partial<ClassroomSession> => ({
  actualTopicsCovered: delivery.actualTopicsCovered
    ? [...delivery.actualTopicsCovered]
    : session.actualTopicsCovered,
  activitiesCompleted: delivery.activitiesCompleted
    ? [...delivery.activitiesCompleted]
    : session.activitiesCompleted,
  resourcesUsedIds: delivery.resourcesUsedIds
    ? [...delivery.resourcesUsedIds]
    : session.resourcesUsedIds,
  participation:
    delivery.participation === undefined ? session.participation : delivery.participation,
});

/** Create a new scheduled classroom session. */
export function createClassroomSession(params: CreateClassroomSessionParams): ClassroomSession {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    scheduleSlotId: params.scheduleSlotId ?? null,
    lessonPlanId: params.lessonPlanId ?? null,
    sectionId: params.sectionId ?? null,
    subjectId: params.subjectId ?? null,
    title: requireText(params.title, "title"),
    date: requireText(params.date, "date"),
    plannedTopics: params.plannedTopics ? [...params.plannedTopics] : [],
    actualTopicsCovered: [],
    activitiesCompleted: [],
    resourcesUsedIds: [],
    participation: null,
    teacherReflections: null,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  };
}

/** Replace the session's planned topics. Only while still scheduled. */
export function setPlannedTopics(
  session: ClassroomSession,
  topics: readonly string[],
): ClassroomSession {
  if (session.status !== "scheduled") {
    throw new ClassroomSessionStateError(session.id, "scheduled", session.status);
  }
  return touch(session, { plannedTopics: [...topics] });
}

/** Deliver the session, recording what actually happened (scheduled → delivered). */
export function deliverSession(
  session: ClassroomSession,
  delivery: SessionDelivery,
): ClassroomSession {
  if (session.status !== "scheduled") {
    throw new ClassroomSessionStateError(session.id, "scheduled", session.status);
  }
  return touch(session, { ...applyDelivery(session, delivery), status: "delivered" });
}

/** Amend the actual-delivery record of a delivered session (before completion). */
export function amendSessionDelivery(
  session: ClassroomSession,
  delivery: SessionDelivery,
): ClassroomSession {
  if (session.status !== "delivered") {
    throw new ClassroomSessionStateError(session.id, "delivered", session.status);
  }
  return touch(session, applyDelivery(session, delivery));
}

/** Record the teacher's reflections on a delivered session. */
export function recordSessionReflections(
  session: ClassroomSession,
  reflections: string | null,
): ClassroomSession {
  if (session.status !== "delivered") {
    throw new ClassroomSessionStateError(session.id, "delivered", session.status);
  }
  return touch(session, { teacherReflections: reflections?.trim() || null });
}

/** Complete the session (delivered → completed). Terminal. */
export function completeSession(session: ClassroomSession): ClassroomSession {
  if (session.status !== "delivered") {
    throw new ClassroomSessionStateError(session.id, "delivered", session.status);
  }
  return touch(session, { status: "completed" });
}

/** Cancel the session (from scheduled or delivered). Terminal. */
export function cancelSession(session: ClassroomSession): ClassroomSession {
  if (session.status === "completed" || session.status === "cancelled") {
    throw new ClassroomSessionStateError(session.id, "scheduled or delivered", session.status);
  }
  return touch(session, { status: "cancelled" });
}
