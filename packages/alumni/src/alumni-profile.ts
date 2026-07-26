import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyGraduationYearError, InvalidAlumniTransitionError } from "./errors";
import type { AlumniStatus } from "./alumni-value";

/**
 * An alumni profile — an alumnus's membership in the institution's alumni network, built on the alumnus
 * lifecycle stage that Student Lifecycle (P2-D03) owns. It references the alumnus as a Person (P2-D01-M02),
 * carries their graduation year and optional program, and runs `active ↔ lapsed → opted_out`; opting out is a
 * terminal unsubscribe from the network. It is the anchor the engagement engine reads and the community
 * aggregates (chapters, events, mentorship, contributions) attach to. One profile per person per tenant.
 */
export interface AlumniProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly alumnusPersonId: Uuid;
  readonly graduationYear: string;
  readonly program: string | null;
  readonly status: AlumniStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAlumniProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly alumnusPersonId: Uuid;
  readonly graduationYear: string;
  readonly program?: string | null;
}

/** Create an alumni profile (status `active`). Graduation year required. */
export function createAlumniProfile(params: CreateAlumniProfileParams): AlumniProfile {
  const graduationYear = params.graduationYear.trim();
  if (graduationYear.length === 0) {
    throw new EmptyGraduationYearError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    alumnusPersonId: params.alumnusPersonId,
    graduationYear,
    program: params.program?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (profile: AlumniProfile, patch: Partial<AlumniProfile>): AlumniProfile => ({
  ...profile,
  ...patch,
  updatedAt: nowIso(),
});

/** Update a profile's graduation year and/or program; not allowed once opted out. */
export function updateAlumniProfile(
  profile: AlumniProfile,
  patch: { graduationYear?: string; program?: string | null },
): AlumniProfile {
  if (profile.status === "opted_out") {
    throw new InvalidAlumniTransitionError(profile.status, "updated");
  }
  const next: { graduationYear?: string; program?: string | null } = {};
  if (patch.graduationYear !== undefined) {
    const graduationYear = patch.graduationYear.trim();
    if (graduationYear.length === 0) {
      throw new EmptyGraduationYearError();
    }
    next.graduationYear = graduationYear;
  }
  if (patch.program !== undefined) {
    next.program = patch.program?.trim() || null;
  }
  return touch(profile, next);
}

/** Mark an active profile lapsed (`active → lapsed`). */
export function markAlumniLapsed(profile: AlumniProfile): AlumniProfile {
  if (profile.status !== "active") {
    throw new InvalidAlumniTransitionError(profile.status, "lapsed");
  }
  return touch(profile, { status: "lapsed" });
}

/** Reactivate a lapsed profile (`lapsed → active`). */
export function reactivateAlumni(profile: AlumniProfile): AlumniProfile {
  if (profile.status !== "lapsed") {
    throw new InvalidAlumniTransitionError(profile.status, "active");
  }
  return touch(profile, { status: "active" });
}

/** Opt a profile out of the network (`active`/`lapsed → opted_out`, terminal). */
export function optOutAlumni(profile: AlumniProfile): AlumniProfile {
  if (profile.status === "opted_out") {
    throw new InvalidAlumniTransitionError(profile.status, "opted_out");
  }
  return touch(profile, { status: "opted_out" });
}

/** Whether the profile is still in the network (active or lapsed). */
export const isAlumniInNetwork = (profile: AlumniProfile): boolean =>
  profile.status === "active" || profile.status === "lapsed";
