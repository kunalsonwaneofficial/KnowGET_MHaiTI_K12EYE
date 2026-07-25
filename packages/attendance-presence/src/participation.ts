import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyParticipationFieldError } from "./errors";
import type { ActivityType, EngagementLevel } from "./participation-type";

/**
 * A record of a participant's involvement in a co-curricular activity — a club, sport,
 * cultural activity, competition, institutional event or community service. Broadens
 * attendance into institutional engagement and feeds the presence profile's participation
 * signals (its `activityType` + `date` structurally satisfy the intelligence engine's view).
 */
export interface Participation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly activityType: ActivityType;
  readonly activityName: string;
  readonly date: string;
  readonly sessionId: Uuid | null;
  readonly role: string | null;
  readonly engagementLevel: EngagementLevel | null;
  readonly remarks: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateParticipationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly participantId: Uuid;
  readonly activityType: ActivityType;
  readonly activityName: string;
  readonly date: string;
  readonly sessionId?: Uuid | null;
  readonly role?: string | null;
  readonly engagementLevel?: EngagementLevel | null;
  readonly remarks?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyParticipationFieldError(field);
  }
  return trimmed;
};

const touch = (participation: Participation, patch: Partial<Participation>): Participation => ({
  ...participation,
  ...patch,
  updatedAt: nowIso(),
});

/** Record a participation, validating the activity name and date. */
export function createParticipation(params: CreateParticipationParams): Participation {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    participantId: params.participantId,
    activityType: params.activityType,
    activityName: requireText(params.activityName, "activityName"),
    date: requireText(params.date, "date"),
    sessionId: params.sessionId ?? null,
    role: params.role?.trim() || null,
    engagementLevel: params.engagementLevel ?? null,
    remarks: params.remarks?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Set (or clear) the engagement level of a participation. */
export function setEngagementLevel(
  participation: Participation,
  engagementLevel: EngagementLevel | null,
): Participation {
  return touch(participation, { engagementLevel });
}

/** Amend a participation's free-text remarks. */
export function amendParticipationRemarks(
  participation: Participation,
  remarks: string | null,
): Participation {
  return touch(participation, { remarks: remarks?.trim() || null });
}
