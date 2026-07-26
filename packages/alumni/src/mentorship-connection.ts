import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidMentorshipTransitionError, SelfMentorshipError } from "./errors";
import type { MentorshipStatus } from "./alumni-value";

/**
 * A mentorship connection — a relationship between two alumni profiles, a mentor and a mentee, with an
 * optional focus. It runs `proposed → active → completed`, with `ended` reachable from either open state.
 * The mentor and mentee must be distinct. An active mentorship counts toward both alumni's engagement.
 */
export interface MentorshipConnection {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly mentorProfileId: Uuid;
  readonly menteeProfileId: Uuid;
  readonly focus: string | null;
  readonly status: MentorshipStatus;
  readonly proposedOn: string;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ProposeMentorshipParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly mentorProfileId: Uuid;
  readonly menteeProfileId: Uuid;
  readonly proposedOn: string;
  readonly focus?: string | null;
}

/** Propose a mentorship (status `proposed`). Mentor and mentee must be distinct. */
export function proposeMentorship(params: ProposeMentorshipParams): MentorshipConnection {
  if (params.mentorProfileId === params.menteeProfileId) {
    throw new SelfMentorshipError(params.mentorProfileId);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    mentorProfileId: params.mentorProfileId,
    menteeProfileId: params.menteeProfileId,
    focus: params.focus?.trim() || null,
    status: "proposed",
    proposedOn: params.proposedOn,
    startedOn: null,
    endedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  connection: MentorshipConnection,
  patch: Partial<MentorshipConnection>,
): MentorshipConnection => ({
  ...connection,
  ...patch,
  updatedAt: nowIso(),
});

/** Activate a proposed mentorship (`proposed → active`), stamping the start date. */
export function activateMentorship(
  connection: MentorshipConnection,
  startedOn: string,
): MentorshipConnection {
  if (connection.status !== "proposed") {
    throw new InvalidMentorshipTransitionError(connection.status, "active");
  }
  return touch(connection, { status: "active", startedOn });
}

/** Complete an active mentorship (`active → completed`, terminal), stamping the end date. */
export function completeMentorship(
  connection: MentorshipConnection,
  endedOn: string,
): MentorshipConnection {
  if (connection.status !== "active") {
    throw new InvalidMentorshipTransitionError(connection.status, "completed");
  }
  return touch(connection, { status: "completed", endedOn });
}

/** End a proposed or active mentorship (→ `ended`, terminal), stamping the end date. */
export function endMentorship(
  connection: MentorshipConnection,
  endedOn: string,
): MentorshipConnection {
  if (connection.status !== "proposed" && connection.status !== "active") {
    throw new InvalidMentorshipTransitionError(connection.status, "ended");
  }
  return touch(connection, { status: "ended", endedOn });
}

/** Whether the mentorship is active. */
export const isMentorshipActive = (connection: MentorshipConnection): boolean =>
  connection.status === "active";
