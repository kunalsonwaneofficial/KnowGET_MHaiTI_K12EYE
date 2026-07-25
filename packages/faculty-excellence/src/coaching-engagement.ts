import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyFocusError, InvalidEngagementTransitionError, SelfCoachingError } from "./errors";
import type { EngagementStatus } from "./faculty-value";

/**
 * A coaching engagement — a coach↔coachee development cycle with a focus, optionally anchored to a
 * competency {@link CompetencyFramework}. It runs `proposed → active → completed | cancelled`.
 * Coaching sessions are logged against it while active. The coach and coachee are both employees and
 * must differ.
 */
export interface CoachingEngagement {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly coachId: Uuid;
  readonly coacheeId: Uuid;
  readonly focus: string;
  readonly frameworkId: Uuid | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: EngagementStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ProposeEngagementParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly coachId: Uuid;
  readonly coacheeId: Uuid;
  readonly focus: string;
  readonly frameworkId?: Uuid | null;
  readonly startDate?: string | null;
}

/** Propose a coaching engagement (status `proposed`). Focus is required; coach must differ from coachee. */
export function proposeEngagement(params: ProposeEngagementParams): CoachingEngagement {
  const focus = params.focus.trim();
  if (focus.length === 0) {
    throw new EmptyFocusError();
  }
  if (params.coachId === params.coacheeId) {
    throw new SelfCoachingError(params.coachId);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    coachId: params.coachId,
    coacheeId: params.coacheeId,
    focus,
    frameworkId: params.frameworkId ?? null,
    startDate: params.startDate ?? now.slice(0, 10),
    endDate: null,
    status: "proposed",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  engagement: CoachingEngagement,
  patch: Partial<CoachingEngagement>,
): CoachingEngagement => ({
  ...engagement,
  ...patch,
  updatedAt: nowIso(),
});

/** Set (or clear) the engagement focus (while non-terminal). */
export function setEngagementFocus(
  engagement: CoachingEngagement,
  focus: string,
): CoachingEngagement {
  if (engagement.status === "completed" || engagement.status === "cancelled") {
    throw new InvalidEngagementTransitionError(engagement.status, "set_focus");
  }
  const trimmed = focus.trim();
  if (trimmed.length === 0) {
    throw new EmptyFocusError();
  }
  return touch(engagement, { focus: trimmed });
}

/** Accept a proposed engagement, starting the coaching relationship (→ `active`). */
export function acceptEngagement(engagement: CoachingEngagement): CoachingEngagement {
  if (engagement.status !== "proposed") {
    throw new InvalidEngagementTransitionError(engagement.status, "active");
  }
  return touch(engagement, { status: "active" });
}

/** Complete an active engagement, stamping the end date (→ `completed`). */
export function completeEngagement(
  engagement: CoachingEngagement,
  endDate?: string | null,
): CoachingEngagement {
  if (engagement.status !== "active") {
    throw new InvalidEngagementTransitionError(engagement.status, "completed");
  }
  return touch(engagement, {
    status: "completed",
    endDate: endDate ?? nowIso().slice(0, 10),
  });
}

/** Cancel a proposed or active engagement (→ `cancelled`). */
export function cancelEngagement(
  engagement: CoachingEngagement,
  endDate?: string | null,
): CoachingEngagement {
  if (engagement.status !== "proposed" && engagement.status !== "active") {
    throw new InvalidEngagementTransitionError(engagement.status, "cancelled");
  }
  return touch(engagement, {
    status: "cancelled",
    endDate: endDate ?? nowIso().slice(0, 10),
  });
}

/** Whether the engagement is currently active (sessions may be logged against it). */
export const isEngagementRunning = (engagement: CoachingEngagement): boolean =>
  engagement.status === "active";
