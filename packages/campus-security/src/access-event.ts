import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AccessDecision, AccessDecisionReason } from "./campus-security-value";

/**
 * An access event — an immutable, append-only record of one access decision: a credential presented at a
 * zone (optionally a specific point/door) at a moment, the decision (granted / denied) and its reason code.
 * It has no lifecycle and no edit or delete path — the record of what happened at the door never changes.
 * It structurally satisfies the access-activity view (its `decision`), so a set of events rolls up into the
 * granted/denied activity summary. The decision itself is produced by the pure access engine.
 */
export interface AccessEvent {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly credentialId: Uuid;
  readonly zoneId: Uuid;
  readonly pointLabel: string | null;
  readonly decision: AccessDecision;
  readonly reason: AccessDecisionReason;
  readonly occurredAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordAccessEventParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly credentialId: Uuid;
  readonly zoneId: Uuid;
  readonly pointLabel?: string | null;
  readonly decision: AccessDecision;
  readonly reason: AccessDecisionReason;
  readonly occurredAt: string;
}

/**
 * Record an access event. Immutable: there is no update path — the door log is append-only, a correction is
 * a new event, never an edit of an old one.
 */
export function recordAccessEvent(params: RecordAccessEventParams): AccessEvent {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    credentialId: params.credentialId,
    zoneId: params.zoneId,
    pointLabel: params.pointLabel?.trim() || null,
    decision: params.decision,
    reason: params.reason,
    occurredAt: params.occurredAt,
    createdAt: now,
    updatedAt: now,
  };
}
