import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyAudienceCodeError,
  EmptyAudienceNameError,
  InvalidAudienceTransitionError,
} from "./errors";
import type { AudienceStatus } from "./engagement-value";

/**
 * An audience — a named, reusable target group for communications and surveys (e.g. "Grade 5 Parents",
 * "All Teaching Staff"). It holds an explicit set of member Person ids plus an optional descriptive criteria
 * label recording how the group is defined. It runs `active → archived` (terminal); an archived audience
 * cannot be targeted by a new announcement or survey. The member ids are stored as an opaque set — they are
 * not per-item existence-validated on write (the organization is the validated anchor); its **size**
 * (`memberPersonIds.length`) is what the reach and response-rate engines read as the audience size.
 */
export interface Audience {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly criteriaLabel: string | null;
  readonly memberPersonIds: readonly Uuid[];
  readonly status: AudienceStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAudienceParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly criteriaLabel?: string | null;
  readonly memberPersonIds?: readonly Uuid[];
}

const dedupe = (ids: readonly Uuid[]): Uuid[] => [...new Set(ids)];

/** Create an audience (status `active`). Code and name required; member ids de-duplicated. */
export function createAudience(params: CreateAudienceParams): Audience {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyAudienceCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyAudienceNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    description: params.description?.trim() || null,
    criteriaLabel: params.criteriaLabel?.trim() || null,
    memberPersonIds: dedupe(params.memberPersonIds ?? []),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (audience: Audience, patch: Partial<Audience>): Audience => ({
  ...audience,
  ...patch,
  updatedAt: nowIso(),
});

const requireActive = (audience: Audience, to: string): void => {
  if (audience.status !== "active") {
    throw new InvalidAudienceTransitionError(audience.status, to);
  }
};

/** Rename an audience; not allowed once archived. */
export function renameAudience(audience: Audience, name: string): Audience {
  requireActive(audience, "renamed");
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyAudienceNameError();
  }
  return touch(audience, { name: trimmed });
}

/** Set the audience's description; not allowed once archived. */
export function setAudienceDescription(audience: Audience, description: string | null): Audience {
  requireActive(audience, "description-set");
  return touch(audience, { description: description?.trim() || null });
}

/** Set the audience's criteria label (how the group is defined); not allowed once archived. */
export function setAudienceCriteria(audience: Audience, criteriaLabel: string | null): Audience {
  requireActive(audience, "criteria-set");
  return touch(audience, { criteriaLabel: criteriaLabel?.trim() || null });
}

/** Add members to the audience (de-duplicated); not allowed once archived. */
export function addAudienceMembers(audience: Audience, personIds: readonly Uuid[]): Audience {
  requireActive(audience, "members-added");
  return touch(audience, { memberPersonIds: dedupe([...audience.memberPersonIds, ...personIds]) });
}

/** Remove members from the audience; not allowed once archived. */
export function removeAudienceMembers(audience: Audience, personIds: readonly Uuid[]): Audience {
  requireActive(audience, "members-removed");
  const remove = new Set<string>(personIds);
  return touch(audience, {
    memberPersonIds: audience.memberPersonIds.filter((id) => !remove.has(id)),
  });
}

/** Archive an audience (→ `archived`, terminal). */
export function archiveAudience(audience: Audience): Audience {
  requireActive(audience, "archived");
  return touch(audience, { status: "archived" });
}

/** The audience's size — its member count, read by the reach and response-rate engines. */
export const audienceSize = (audience: Audience): number => audience.memberPersonIds.length;

/** Whether the audience is active (targetable). */
export const isAudienceActive = (audience: Audience): boolean => audience.status === "active";
