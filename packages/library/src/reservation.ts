import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidReservationTransitionError } from "./errors";
import { OPEN_RESERVATION_STATUSES, type ReservationStatus } from "./library-value";

/**
 * A reservation — a {@link LibraryMember}'s hold on a {@link Title} (not a specific copy). It carries a
 * queue position (its order among the title's open holds) and, once a copy is free, a ready date and a
 * hold shelf-life deadline. It runs `requested` (queued) → `ready` (a copy is free, the member is
 * notified) → `fulfilled` (checked out), or → `cancelled` / `expired` (the shelf life lapsed). At most one
 * open reservation per member per title. The organization is derived from the title.
 */
export interface Reservation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly titleId: Uuid;
  readonly memberId: Uuid;
  readonly requestedOn: string;
  readonly queuePosition: number;
  readonly readyOn: string | null;
  readonly expiresOn: string | null;
  readonly status: ReservationStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface PlaceReservationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly titleId: Uuid;
  readonly memberId: Uuid;
  readonly requestedOn: string;
  readonly queuePosition: number;
}

/** Place a reservation (status `requested`) at a queue position. */
export function placeReservation(params: PlaceReservationParams): Reservation {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    titleId: params.titleId,
    memberId: params.memberId,
    requestedOn: params.requestedOn,
    queuePosition: params.queuePosition,
    readyOn: null,
    expiresOn: null,
    status: "requested",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (reservation: Reservation, patch: Partial<Reservation>): Reservation => ({
  ...reservation,
  ...patch,
  updatedAt: nowIso(),
});

/** Mark a requested reservation ready (→ `ready`), stamping the ready date and hold-shelf deadline. */
export function markReservationReady(
  reservation: Reservation,
  readyOn: string,
  expiresOn: string,
): Reservation {
  if (reservation.status !== "requested") {
    throw new InvalidReservationTransitionError(reservation.status, "ready");
  }
  return touch(reservation, { status: "ready", readyOn, expiresOn });
}

/** Fulfil a ready reservation (→ `fulfilled`, the member checked the copy out). */
export function fulfillReservation(reservation: Reservation): Reservation {
  if (reservation.status !== "ready") {
    throw new InvalidReservationTransitionError(reservation.status, "fulfilled");
  }
  return touch(reservation, { status: "fulfilled" });
}

/** Cancel an open reservation (→ `cancelled`). */
export function cancelReservation(reservation: Reservation): Reservation {
  if (!OPEN_RESERVATION_STATUSES.includes(reservation.status)) {
    throw new InvalidReservationTransitionError(reservation.status, "cancelled");
  }
  return touch(reservation, { status: "cancelled" });
}

/** Expire a ready reservation whose hold shelf life lapsed (→ `expired`). */
export function expireReservation(reservation: Reservation): Reservation {
  if (reservation.status !== "ready") {
    throw new InvalidReservationTransitionError(reservation.status, "expired");
  }
  return touch(reservation, { status: "expired" });
}

/** Whether the reservation is still open (requested/ready) — blocks a second open hold on the title. */
export const isReservationOpen = (reservation: Reservation): boolean =>
  OPEN_RESERVATION_STATUSES.includes(reservation.status);
