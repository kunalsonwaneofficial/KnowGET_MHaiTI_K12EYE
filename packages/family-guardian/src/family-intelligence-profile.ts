import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyInteractionSummaryError, InvalidParticipationRateError } from "./errors";
import {
  EMPTY_FAMILY_INDICATORS,
  type FamilyIntelligenceIndicators,
} from "./family-intelligence-indicators";
import type { FamilyInteraction, FamilyInteractionKind } from "./family-interaction";

/**
 * A family's AI-ready intelligence profile — a structured, privacy-aware surface of
 * engagement indicators plus an append-only institutional interaction timeline. One per
 * family. This domain owns the **model and integration points only**; prediction and
 * scoring are deferred to the Institutional Intelligence program, which consumes this.
 */
export interface FamilyIntelligenceProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly familyId: Uuid;
  readonly indicators: FamilyIntelligenceIndicators;
  readonly interactions: readonly FamilyInteraction[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateFamilyIntelligenceProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly familyId: Uuid;
}

/** Create a new, empty family intelligence profile. */
export function createFamilyIntelligenceProfile(
  params: CreateFamilyIntelligenceProfileParams,
): FamilyIntelligenceProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    familyId: params.familyId,
    indicators: EMPTY_FAMILY_INDICATORS,
    interactions: [],
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  profile: FamilyIntelligenceProfile,
  patch: Partial<FamilyIntelligenceProfile>,
): FamilyIntelligenceProfile => ({ ...profile, ...patch, updatedAt: nowIso() });

/** Merge a patch into the family's indicators. */
export function updateIndicators(
  profile: FamilyIntelligenceProfile,
  patch: Partial<FamilyIntelligenceIndicators>,
): FamilyIntelligenceProfile {
  if (patch.participationRate !== undefined && patch.participationRate !== null) {
    const rate = patch.participationRate;
    if (Number.isNaN(rate) || rate < 0 || rate > 1) {
      throw new InvalidParticipationRateError(rate);
    }
  }
  return touch(profile, { indicators: { ...profile.indicators, ...patch } });
}

export interface RecordInteractionParams {
  readonly kind: FamilyInteractionKind;
  readonly summary: string;
}

/** Append an interaction to the immutable timeline. */
export function recordInteraction(
  profile: FamilyIntelligenceProfile,
  params: RecordInteractionParams,
): FamilyIntelligenceProfile {
  const summary = params.summary.trim();
  if (summary.length === 0) {
    throw new EmptyInteractionSummaryError();
  }
  const interaction: FamilyInteraction = { at: nowIso(), kind: params.kind, summary };
  return touch(profile, { interactions: [...profile.interactions, interaction] });
}
