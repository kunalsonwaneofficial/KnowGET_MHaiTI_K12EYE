import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/**
 * A coaching session — a single logged session within a {@link CoachingEngagement}, recording the
 * session focus, notes and agreed next steps. Sessions are a permanent record of the coaching
 * relationship; they carry no lifecycle (they are logged, then optionally amended).
 */
export interface CoachingSession {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly engagementId: Uuid;
  readonly sessionDate: string;
  readonly focus: string | null;
  readonly notes: string | null;
  readonly nextSteps: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface LogSessionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly engagementId: Uuid;
  readonly sessionDate?: string | null;
  readonly focus?: string | null;
  readonly notes?: string | null;
  readonly nextSteps?: string | null;
}

/** Log a coaching session against an engagement. */
export function logSession(params: LogSessionParams): CoachingSession {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    engagementId: params.engagementId,
    sessionDate: params.sessionDate ?? now.slice(0, 10),
    focus: params.focus?.trim() || null,
    notes: params.notes?.trim() || null,
    nextSteps: params.nextSteps?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface AmendSessionParams {
  readonly focus?: string | null;
  readonly notes?: string | null;
  readonly nextSteps?: string | null;
}

/** Amend a session's focus, notes or next steps (only the provided fields change). */
export function amendSession(
  session: CoachingSession,
  params: AmendSessionParams,
): CoachingSession {
  return {
    ...session,
    ...(params.focus !== undefined ? { focus: params.focus?.trim() || null } : {}),
    ...(params.notes !== undefined ? { notes: params.notes?.trim() || null } : {}),
    ...(params.nextSteps !== undefined ? { nextSteps: params.nextSteps?.trim() || null } : {}),
    updatedAt: nowIso(),
  };
}
