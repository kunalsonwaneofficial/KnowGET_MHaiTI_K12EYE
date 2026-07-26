import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ContributionType, RecognitionTier } from "./alumni-value";

/**
 * A contribution — an immutable, append-only record that an alumni profile made a giving act (a pledge, a
 * gift, a recurring commitment or an in-kind donation), with the non-monetary recognition tier the institution
 * records for it and an optional campaign reference. It has **no money** — the gift _amount_ is Finance's
 * (P2-D14); this domain records the relationship fact, not the transaction — and no lifecycle: a contribution
 * is a fact, and a correction is a new record. The contributions an alumnus has made feed the engagement
 * engine.
 */
export interface Contribution {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly type: ContributionType;
  readonly recognitionTier: RecognitionTier;
  readonly campaignRef: string | null;
  readonly contributedOn: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordContributionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly alumniProfileId: Uuid;
  readonly type: ContributionType;
  readonly recognitionTier: RecognitionTier;
  readonly contributedOn: string;
  readonly campaignRef?: string | null;
}

/** Record a contribution. Immutable: factory only, no money, no update or delete path. */
export function recordContribution(params: RecordContributionParams): Contribution {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    alumniProfileId: params.alumniProfileId,
    type: params.type,
    recognitionTier: params.recognitionTier,
    campaignRef: params.campaignRef?.trim() || null,
    contributedOn: params.contributedOn,
    createdAt: now,
    updatedAt: now,
  };
}
