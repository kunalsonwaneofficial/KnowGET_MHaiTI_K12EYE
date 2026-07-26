import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Copy } from "./copy";
import type { Title } from "./title";

// --- Title -----------------------------------------------------------------------
export const TITLE_CATALOGED = "library.title.cataloged";
export const TITLE_WITHDRAWN = "library.title.withdrawn";
export const TITLE_RESTORED = "library.title.restored";

export interface TitleEventPayload {
  readonly titleId: Uuid;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly status: string;
}

export type TitleCatalogedEvent = DomainEvent<typeof TITLE_CATALOGED, TitleEventPayload>;
export type TitleWithdrawnEvent = DomainEvent<typeof TITLE_WITHDRAWN, TitleEventPayload>;
export type TitleRestoredEvent = DomainEvent<typeof TITLE_RESTORED, TitleEventPayload>;

const titlePayload = (title: Title): TitleEventPayload => ({
  titleId: title.id,
  organizationId: title.organizationId,
  title: title.title,
  status: title.status,
});

export const titleCataloged = (title: Title): TitleCatalogedEvent =>
  createEvent(TITLE_CATALOGED, titlePayload(title), { tenantId: title.tenantId });

export const titleWithdrawn = (title: Title): TitleWithdrawnEvent =>
  createEvent(TITLE_WITHDRAWN, titlePayload(title), { tenantId: title.tenantId });

export const titleRestored = (title: Title): TitleRestoredEvent =>
  createEvent(TITLE_RESTORED, titlePayload(title), { tenantId: title.tenantId });

// --- Copy ------------------------------------------------------------------------
export const COPY_ACCESSIONED = "library.copy.accessioned";
export const COPY_ISSUED = "library.copy.issued";
export const COPY_RETURNED = "library.copy.returned";
export const COPY_LOST = "library.copy.lost";
export const COPY_WITHDRAWN = "library.copy.withdrawn";

export interface CopyEventPayload {
  readonly copyId: Uuid;
  readonly organizationId: Uuid;
  readonly titleId: Uuid;
  readonly barcode: string;
  readonly status: string;
}

export type CopyAccessionedEvent = DomainEvent<typeof COPY_ACCESSIONED, CopyEventPayload>;
export type CopyIssuedEvent = DomainEvent<typeof COPY_ISSUED, CopyEventPayload>;
export type CopyReturnedEvent = DomainEvent<typeof COPY_RETURNED, CopyEventPayload>;
export type CopyLostEvent = DomainEvent<typeof COPY_LOST, CopyEventPayload>;
export type CopyWithdrawnEvent = DomainEvent<typeof COPY_WITHDRAWN, CopyEventPayload>;

const copyPayload = (copy: Copy): CopyEventPayload => ({
  copyId: copy.id,
  organizationId: copy.organizationId,
  titleId: copy.titleId,
  barcode: copy.barcode,
  status: copy.status,
});

export const copyAccessioned = (copy: Copy): CopyAccessionedEvent =>
  createEvent(COPY_ACCESSIONED, copyPayload(copy), { tenantId: copy.tenantId });

export const copyIssued = (copy: Copy): CopyIssuedEvent =>
  createEvent(COPY_ISSUED, copyPayload(copy), { tenantId: copy.tenantId });

export const copyReturned = (copy: Copy): CopyReturnedEvent =>
  createEvent(COPY_RETURNED, copyPayload(copy), { tenantId: copy.tenantId });

export const copyLost = (copy: Copy): CopyLostEvent =>
  createEvent(COPY_LOST, copyPayload(copy), { tenantId: copy.tenantId });

export const copyWithdrawn = (copy: Copy): CopyWithdrawnEvent =>
  createEvent(COPY_WITHDRAWN, copyPayload(copy), { tenantId: copy.tenantId });
