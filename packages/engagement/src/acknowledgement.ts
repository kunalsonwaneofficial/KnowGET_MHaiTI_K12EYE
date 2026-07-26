import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/**
 * An acknowledgement receipt — an immutable, append-only record that a person acknowledged (read / confirmed)
 * a published announcement at a moment. It has no lifecycle and no edit or delete path: a receipt is a fact.
 * The count of receipts for an announcement is exactly what the engagement engine reads as its acknowledged
 * count; a single receipt per (announcement, person) is enforced by the service.
 */
export interface AcknowledgementReceipt {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly announcementId: Uuid;
  readonly personId: Uuid;
  readonly acknowledgedAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordAcknowledgementParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly announcementId: Uuid;
  readonly personId: Uuid;
  readonly acknowledgedAt: string;
}

/**
 * Record an acknowledgement receipt. Immutable: there is no update path — a correction is a new decision by
 * the service (which enforces one receipt per announcement/person), never an edit of an old receipt.
 */
export function recordAcknowledgement(params: RecordAcknowledgementParams): AcknowledgementReceipt {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    announcementId: params.announcementId,
    personId: params.personId,
    acknowledgedAt: params.acknowledgedAt,
    createdAt: now,
    updatedAt: now,
  };
}
