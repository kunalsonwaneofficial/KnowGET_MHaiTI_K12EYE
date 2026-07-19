import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyFollowUpNoteError, InvalidProspectTransitionError } from "./errors";
import type { LeadSource } from "./lead-source";

/**
 * The prospect funnel: a captured enquiry (`new`) is worked through `contacted`
 * and `qualified`, then either `converted` into an application or marked `lost`.
 */
export type ProspectStatus = "new" | "contacted" | "qualified" | "converted" | "lost";

/** A dated note in a prospect's communication history. */
export interface ProspectFollowUp {
  readonly note: string;
  readonly on: string;
  readonly byId: Uuid | null;
}

/**
 * A prospective learner before they apply — the top of the admissions funnel. The
 * learner's identity is a {@link Person} (`personId`); the prospect adds only the
 * lead metadata (source, campaign, interests) and the follow-up history. Never
 * duplicates personal data.
 */
export interface Prospect {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly leadSource: LeadSource;
  readonly campaign: string | null;
  readonly interests: readonly string[];
  readonly status: ProspectStatus;
  readonly followUps: readonly ProspectFollowUp[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateProspectParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly leadSource: LeadSource;
  readonly campaign?: string | null;
  readonly interests?: readonly string[];
}

/** Capture a new enquiry as a prospect (status `new`). */
export function createProspect(params: CreateProspectParams): Prospect {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    personId: params.personId,
    leadSource: params.leadSource,
    campaign: params.campaign?.trim() || null,
    interests: params.interests ?? [],
    status: "new",
    followUps: [],
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (prospect: Prospect, patch: Partial<Prospect>): Prospect => ({
  ...prospect,
  ...patch,
  updatedAt: nowIso(),
});

/** Statuses from which a prospect is still being actively worked. */
const ACTIVE: readonly ProspectStatus[] = ["new", "contacted", "qualified"];

/** Append a follow-up note to a prospect still in the funnel. */
export function recordFollowUp(prospect: Prospect, note: string, byId?: Uuid): Prospect {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    throw new EmptyFollowUpNoteError();
  }
  if (!ACTIVE.includes(prospect.status)) {
    throw new InvalidProspectTransitionError(prospect.status, "follow_up");
  }
  const entry: ProspectFollowUp = { note: trimmed, on: nowIso().slice(0, 10), byId: byId ?? null };
  return touch(prospect, { followUps: [...prospect.followUps, entry] });
}

function transition(
  prospect: Prospect,
  to: ProspectStatus,
  allowedFrom: readonly ProspectStatus[],
): Prospect {
  if (!allowedFrom.includes(prospect.status)) {
    throw new InvalidProspectTransitionError(prospect.status, to);
  }
  return touch(prospect, { status: to });
}

/** Mark that the prospect has been contacted. */
export const contactProspect = (prospect: Prospect): Prospect =>
  transition(prospect, "contacted", ["new"]);

/** Qualify the prospect as a genuine admissions lead. */
export const qualifyProspect = (prospect: Prospect): Prospect =>
  transition(prospect, "qualified", ["new", "contacted"]);

/** Convert a qualified prospect (an application will be created from it). */
export const convertProspect = (prospect: Prospect): Prospect =>
  transition(prospect, "converted", ["qualified"]);

/** Close out a prospect who did not proceed. */
export const loseProspect = (prospect: Prospect): Prospect =>
  transition(prospect, "lost", ["new", "contacted", "qualified"]);

/** Whether the prospect is still open in the funnel. */
export const isActive = (prospect: Prospect): boolean => ACTIVE.includes(prospect.status);
