import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Copy } from "./copy";
import type { DigitalAsset } from "./digital-asset";
import type { LibraryMember } from "./library-member";
import type { Loan } from "./loan";
import type { Reservation } from "./reservation";
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

// --- Digital asset ---------------------------------------------------------------
export const DIGITAL_CATALOGED = "library.digital.cataloged";
export const DIGITAL_RETIRED = "library.digital.retired";
export const DIGITAL_REACTIVATED = "library.digital.reactivated";
export const DIGITAL_LICENSE_RENEWED = "library.digital.license_renewed";

export interface DigitalEventPayload {
  readonly assetId: Uuid;
  readonly organizationId: Uuid;
  readonly title: string;
  readonly format: string;
  readonly status: string;
}

export type DigitalCatalogedEvent = DomainEvent<typeof DIGITAL_CATALOGED, DigitalEventPayload>;
export type DigitalRetiredEvent = DomainEvent<typeof DIGITAL_RETIRED, DigitalEventPayload>;
export type DigitalReactivatedEvent = DomainEvent<typeof DIGITAL_REACTIVATED, DigitalEventPayload>;
export type DigitalLicenseRenewedEvent = DomainEvent<
  typeof DIGITAL_LICENSE_RENEWED,
  DigitalEventPayload
>;

const digitalPayload = (asset: DigitalAsset): DigitalEventPayload => ({
  assetId: asset.id,
  organizationId: asset.organizationId,
  title: asset.title,
  format: asset.format,
  status: asset.status,
});

export const digitalCataloged = (asset: DigitalAsset): DigitalCatalogedEvent =>
  createEvent(DIGITAL_CATALOGED, digitalPayload(asset), { tenantId: asset.tenantId });

export const digitalRetired = (asset: DigitalAsset): DigitalRetiredEvent =>
  createEvent(DIGITAL_RETIRED, digitalPayload(asset), { tenantId: asset.tenantId });

export const digitalReactivated = (asset: DigitalAsset): DigitalReactivatedEvent =>
  createEvent(DIGITAL_REACTIVATED, digitalPayload(asset), { tenantId: asset.tenantId });

export const digitalLicenseRenewed = (asset: DigitalAsset): DigitalLicenseRenewedEvent =>
  createEvent(DIGITAL_LICENSE_RENEWED, digitalPayload(asset), { tenantId: asset.tenantId });

// --- Library member --------------------------------------------------------------
export const MEMBER_REGISTERED = "library.member.registered";
export const MEMBER_SUSPENDED = "library.member.suspended";
export const MEMBER_REINSTATED = "library.member.reinstated";
export const MEMBER_EXPIRED = "library.member.expired";

export interface MemberEventPayload {
  readonly memberId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly membershipNumber: string;
  readonly status: string;
}

export type MemberRegisteredEvent = DomainEvent<typeof MEMBER_REGISTERED, MemberEventPayload>;
export type MemberSuspendedEvent = DomainEvent<typeof MEMBER_SUSPENDED, MemberEventPayload>;
export type MemberReinstatedEvent = DomainEvent<typeof MEMBER_REINSTATED, MemberEventPayload>;
export type MemberExpiredEvent = DomainEvent<typeof MEMBER_EXPIRED, MemberEventPayload>;

const memberPayload = (member: LibraryMember): MemberEventPayload => ({
  memberId: member.id,
  organizationId: member.organizationId,
  personId: member.personId,
  membershipNumber: member.membershipNumber,
  status: member.status,
});

export const memberRegistered = (member: LibraryMember): MemberRegisteredEvent =>
  createEvent(MEMBER_REGISTERED, memberPayload(member), { tenantId: member.tenantId });

export const memberSuspended = (member: LibraryMember): MemberSuspendedEvent =>
  createEvent(MEMBER_SUSPENDED, memberPayload(member), { tenantId: member.tenantId });

export const memberReinstated = (member: LibraryMember): MemberReinstatedEvent =>
  createEvent(MEMBER_REINSTATED, memberPayload(member), { tenantId: member.tenantId });

export const memberExpired = (member: LibraryMember): MemberExpiredEvent =>
  createEvent(MEMBER_EXPIRED, memberPayload(member), { tenantId: member.tenantId });

// --- Loan ------------------------------------------------------------------------
export const LOAN_ISSUED = "library.loan.issued";
export const LOAN_RENEWED = "library.loan.renewed";
export const LOAN_RETURNED = "library.loan.returned";
export const LOAN_LOST = "library.loan.lost";

export interface LoanEventPayload {
  readonly loanId: Uuid;
  readonly organizationId: Uuid;
  readonly copyId: Uuid;
  readonly titleId: Uuid;
  readonly memberId: Uuid;
  readonly status: string;
}

export type LoanIssuedEvent = DomainEvent<typeof LOAN_ISSUED, LoanEventPayload>;
export type LoanRenewedEvent = DomainEvent<typeof LOAN_RENEWED, LoanEventPayload>;
export type LoanReturnedEvent = DomainEvent<typeof LOAN_RETURNED, LoanEventPayload>;
export type LoanLostEvent = DomainEvent<typeof LOAN_LOST, LoanEventPayload>;

const loanPayload = (loan: Loan): LoanEventPayload => ({
  loanId: loan.id,
  organizationId: loan.organizationId,
  copyId: loan.copyId,
  titleId: loan.titleId,
  memberId: loan.memberId,
  status: loan.status,
});

export const loanIssued = (loan: Loan): LoanIssuedEvent =>
  createEvent(LOAN_ISSUED, loanPayload(loan), { tenantId: loan.tenantId });

export const loanRenewed = (loan: Loan): LoanRenewedEvent =>
  createEvent(LOAN_RENEWED, loanPayload(loan), { tenantId: loan.tenantId });

export const loanReturned = (loan: Loan): LoanReturnedEvent =>
  createEvent(LOAN_RETURNED, loanPayload(loan), { tenantId: loan.tenantId });

export const loanLost = (loan: Loan): LoanLostEvent =>
  createEvent(LOAN_LOST, loanPayload(loan), { tenantId: loan.tenantId });

// --- Reservation -----------------------------------------------------------------
export const RESERVATION_PLACED = "library.reservation.placed";
export const RESERVATION_READY = "library.reservation.ready";
export const RESERVATION_FULFILLED = "library.reservation.fulfilled";
export const RESERVATION_CANCELLED = "library.reservation.cancelled";
export const RESERVATION_EXPIRED = "library.reservation.expired";

export interface ReservationEventPayload {
  readonly reservationId: Uuid;
  readonly organizationId: Uuid;
  readonly titleId: Uuid;
  readonly memberId: Uuid;
  readonly status: string;
}

export type ReservationPlacedEvent = DomainEvent<
  typeof RESERVATION_PLACED,
  ReservationEventPayload
>;
export type ReservationReadyEvent = DomainEvent<typeof RESERVATION_READY, ReservationEventPayload>;
export type ReservationFulfilledEvent = DomainEvent<
  typeof RESERVATION_FULFILLED,
  ReservationEventPayload
>;
export type ReservationCancelledEvent = DomainEvent<
  typeof RESERVATION_CANCELLED,
  ReservationEventPayload
>;
export type ReservationExpiredEvent = DomainEvent<
  typeof RESERVATION_EXPIRED,
  ReservationEventPayload
>;

const reservationPayload = (reservation: Reservation): ReservationEventPayload => ({
  reservationId: reservation.id,
  organizationId: reservation.organizationId,
  titleId: reservation.titleId,
  memberId: reservation.memberId,
  status: reservation.status,
});

export const reservationPlaced = (reservation: Reservation): ReservationPlacedEvent =>
  createEvent(RESERVATION_PLACED, reservationPayload(reservation), {
    tenantId: reservation.tenantId,
  });

export const reservationReady = (reservation: Reservation): ReservationReadyEvent =>
  createEvent(RESERVATION_READY, reservationPayload(reservation), {
    tenantId: reservation.tenantId,
  });

export const reservationFulfilled = (reservation: Reservation): ReservationFulfilledEvent =>
  createEvent(RESERVATION_FULFILLED, reservationPayload(reservation), {
    tenantId: reservation.tenantId,
  });

export const reservationCancelled = (reservation: Reservation): ReservationCancelledEvent =>
  createEvent(RESERVATION_CANCELLED, reservationPayload(reservation), {
    tenantId: reservation.tenantId,
  });

export const reservationExpired = (reservation: Reservation): ReservationExpiredEvent =>
  createEvent(RESERVATION_EXPIRED, reservationPayload(reservation), {
    tenantId: reservation.tenantId,
  });
