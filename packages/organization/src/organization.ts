import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidStatusTransitionError } from "./errors";

/**
 * The kind of organizational unit. The hierarchy typically nests from a
 * governing body down to a teaching unit: trust/society → school → campus →
 * department → grade → section.
 */
export type OrganizationType =
  "trust" | "society" | "school" | "campus" | "department" | "grade" | "section";

export type OrganizationStatus = "draft" | "active" | "suspended" | "archived";

/**
 * An organizational unit — a node in the institution's hierarchy. Persona-
 * agnostic: it models structure only. Membership (who belongs to it) arrives in
 * P2-D01-M04; people in M02.
 */
export interface Organization {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly parentId: Uuid | null;
  readonly type: OrganizationType;
  readonly name: string;
  /** Human-facing identifier, unique within the tenant. */
  readonly code: string;
  readonly status: OrganizationStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateOrganizationParams {
  readonly tenantId: TenantId;
  readonly type: OrganizationType;
  readonly name: string;
  readonly code: string;
  readonly parentId?: Uuid | null;
}

/** Create a new organization in `draft` status. */
export function createOrganization(params: CreateOrganizationParams): Organization {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    parentId: params.parentId ?? null,
    type: params.type,
    name: params.name,
    code: params.code,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (organization: Organization, patch: Partial<Organization>): Organization => ({
  ...organization,
  ...patch,
  updatedAt: nowIso(),
});

export const renameOrganization = (organization: Organization, name: string): Organization =>
  touch(organization, { name });

export const reparentOrganization = (
  organization: Organization,
  parentId: Uuid | null,
): Organization => touch(organization, { parentId });

/** Allowed status transitions; `archived` is terminal. */
const STATUS_TRANSITIONS: Readonly<Record<OrganizationStatus, readonly OrganizationStatus[]>> = {
  draft: ["active", "archived"],
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
  archived: [],
};

/** Transition an organization's status, enforcing the allowed state machine. */
export function transitionStatus(organization: Organization, to: OrganizationStatus): Organization {
  if (!STATUS_TRANSITIONS[organization.status].includes(to)) {
    throw new InvalidStatusTransitionError(organization.status, to);
  }
  return touch(organization, { status: to });
}

export const activateOrganization = (organization: Organization): Organization =>
  transitionStatus(organization, "active");

export const suspendOrganization = (organization: Organization): Organization =>
  transitionStatus(organization, "suspended");

export const archiveOrganization = (organization: Organization): Organization =>
  transitionStatus(organization, "archived");
