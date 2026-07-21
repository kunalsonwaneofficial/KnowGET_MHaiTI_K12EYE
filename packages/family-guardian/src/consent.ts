import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ConsentDecision, ConsentType } from "./consent-type";
import { InvalidConsentPeriodError } from "./errors";

/**
 * An institutional consent record — **immutable and append-only**. Every grant or
 * withdrawal writes a new, versioned, timestamped record for a `(student, consentType)`
 * pair; no record is ever edited or deleted, so the consent history is permanent and
 * auditable. The current standing of a consent type is the latest record (see
 * {@link isConsentActive}). Consent may be linked to a governance policy (P2-D02).
 */
export interface Consent {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
  readonly consentType: ConsentType;
  readonly decision: ConsentDecision;
  readonly version: number;
  readonly policyId: Uuid | null;
  readonly note: string | null;
  readonly effectiveOn: string;
  readonly expiresOn: string | null;
  readonly recordedAt: ISODateString;
}

export interface RecordConsentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
  readonly consentType: ConsentType;
  readonly decision: ConsentDecision;
  readonly version: number;
  readonly policyId?: Uuid | null;
  readonly note?: string | null;
  readonly effectiveOn?: string | null;
  readonly expiresOn?: string | null;
}

/** Create an immutable consent record (grant or withdrawal) at the given version. */
export function recordConsent(params: RecordConsentParams): Consent {
  const now = nowIso();
  const effectiveOn = params.effectiveOn ?? now.slice(0, 10);
  const expiresOn = params.expiresOn ?? null;
  if (expiresOn !== null && expiresOn < effectiveOn) {
    throw new InvalidConsentPeriodError();
  }
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    guardianId: params.guardianId,
    consentType: params.consentType,
    decision: params.decision,
    version: params.version,
    policyId: params.policyId ?? null,
    note: params.note?.trim() || null,
    effectiveOn,
    expiresOn,
    recordedAt: now,
  };
}

/**
 * Whether a consent record represents active consent as of a date (default today):
 * it must be a grant, already in effect, and not expired.
 */
export function isConsentActive(consent: Consent, asOf?: string): boolean {
  if (consent.decision !== "granted") {
    return false;
  }
  const date = asOf ?? nowIso().slice(0, 10);
  if (consent.effectiveOn > date) {
    return false;
  }
  return consent.expiresOn === null || consent.expiresOn >= date;
}
