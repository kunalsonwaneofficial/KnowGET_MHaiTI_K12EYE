import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyGovernanceBodyNameError, InvalidGovernanceBodyTransitionError } from "./errors";
import type { GovernanceBodyType } from "./governance-body-type";

export type GovernanceBodyStatus = "active" | "dissolved";

/**
 * An institutional governance body — the authoritative unit of governance for an
 * organization node (a Board of Trustees, Governing Council, School Management
 * Committee, Academic Council, …). Bodies nest via `parentBodyId` to form the
 * governance hierarchy, and govern an Organization node via `organizationId`.
 */
export interface GovernanceBody {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  /** The Organization node this body governs (trust root, school, …). */
  readonly organizationId: Uuid;
  /** The parent body when this one sits beneath another (governance hierarchy). */
  readonly parentBodyId: Uuid | null;
  readonly name: string;
  readonly type: GovernanceBodyType;
  readonly status: GovernanceBodyStatus;
  /** The body's terms of reference / mandate, if recorded. */
  readonly termsOfReference: string | null;
  /** ISO calendar date the body was established. */
  readonly establishedOn: string | null;
  /** ISO calendar date the body was dissolved (set when `dissolved`). */
  readonly dissolvedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateGovernanceBodyParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly type: GovernanceBodyType;
  readonly parentBodyId?: Uuid | null;
  readonly termsOfReference?: string | null;
  readonly establishedOn?: string | null;
}

/** Create a new, `active` governance body (rejecting an empty name). */
export function createGovernanceBody(params: CreateGovernanceBodyParams): GovernanceBody {
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyGovernanceBodyNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    parentBodyId: params.parentBodyId ?? null,
    name,
    type: params.type,
    status: "active",
    termsOfReference: params.termsOfReference?.trim() || null,
    establishedOn: params.establishedOn ?? null,
    dissolvedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (body: GovernanceBody, patch: Partial<GovernanceBody>): GovernanceBody => ({
  ...body,
  ...patch,
  updatedAt: nowIso(),
});

/** Dissolve an active governance body; a dissolved body cannot be dissolved again. */
export function dissolveGovernanceBody(
  body: GovernanceBody,
  dissolvedOn?: string | null,
): GovernanceBody {
  if (body.status !== "active") {
    throw new InvalidGovernanceBodyTransitionError(body.status, "dissolved");
  }
  return touch(body, { status: "dissolved", dissolvedOn: dissolvedOn ?? null });
}

/** Rename a governance body (rejecting an empty name). */
export function renameGovernanceBody(body: GovernanceBody, name: string): GovernanceBody {
  const next = name.trim();
  if (next.length === 0) {
    throw new EmptyGovernanceBodyNameError();
  }
  return touch(body, { name: next });
}

/** Revise a body's terms of reference (an empty string clears them). */
export function reviseTermsOfReference(
  body: GovernanceBody,
  termsOfReference: string | null,
): GovernanceBody {
  return touch(body, { termsOfReference: termsOfReference?.trim() || null });
}

/** True when the body is currently in effect (status `active`). */
export const isActiveGovernanceBody = (body: GovernanceBody): boolean => body.status === "active";
