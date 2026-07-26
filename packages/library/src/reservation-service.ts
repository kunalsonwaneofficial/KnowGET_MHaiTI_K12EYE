import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateReservationError,
  MemberNotActiveError,
  MemberNotFoundError,
  ReservationNotFoundError,
  TitleNotActiveError,
  TitleNotFoundError,
} from "./errors";
import { isMemberActive } from "./library-member";
import {
  reservationCancelled,
  reservationExpired,
  reservationFulfilled,
  reservationPlaced,
  reservationReady,
} from "./library-events";
import type { LibraryMemberRepository, ReservationRepository, TitleRepository } from "./ports";
import {
  cancelReservation,
  expireReservation,
  fulfillReservation,
  markReservationReady,
  placeReservation,
  type Reservation,
} from "./reservation";
import { isTitleActive } from "./title";

export interface PlaceReservationInput {
  readonly tenantId: TenantId;
  readonly titleId: Uuid;
  readonly memberId: Uuid;
  readonly requestedOn: string;
}

export interface ReservationServiceDeps {
  readonly repository: ReservationRepository;
  readonly titles: TitleRepository;
  readonly members: LibraryMemberRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for reservations — holds on a title. Places a hold for an **active** member on an
 * **active** title (enforcing one open hold per member per title and assigning the next queue position),
 * marks it ready when a copy is free, and fulfils / cancels / expires it. The organization is derived from
 * the title. Publishes the reservation events.
 */
export class ReservationService {
  private readonly repository: ReservationRepository;
  private readonly titles: TitleRepository;
  private readonly members: LibraryMemberRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ReservationServiceDeps) {
    this.repository = deps.repository;
    this.titles = deps.titles;
    this.members = deps.members;
    this.events = deps.events;
  }

  async place(input: PlaceReservationInput): Promise<Reservation> {
    const title = await this.titles.findById(input.tenantId, input.titleId);
    if (!title) {
      throw new TitleNotFoundError(input.titleId);
    }
    if (!isTitleActive(title)) {
      throw new TitleNotActiveError(input.titleId);
    }
    const member = await this.members.findById(input.tenantId, input.memberId);
    if (!member) {
      throw new MemberNotFoundError(input.memberId);
    }
    if (!isMemberActive(member)) {
      throw new MemberNotActiveError(input.memberId);
    }
    if (
      await this.repository.findOpenByMemberAndTitle(input.tenantId, input.memberId, input.titleId)
    ) {
      throw new DuplicateReservationError(input.memberId, input.titleId);
    }
    const open = await this.repository.listOpenByTitle(input.tenantId, input.titleId);
    const reservation = placeReservation({
      tenantId: input.tenantId,
      organizationId: title.organizationId,
      titleId: input.titleId,
      memberId: input.memberId,
      requestedOn: input.requestedOn,
      queuePosition: open.length + 1,
    });
    await this.repository.save(reservation);
    await this.emit(reservationPlaced(reservation));
    return reservation;
  }

  async markReady(
    tenantId: TenantId,
    id: Uuid,
    readyOn: string,
    expiresOn: string,
  ): Promise<Reservation> {
    const updated = markReservationReady(await this.require(tenantId, id), readyOn, expiresOn);
    await this.repository.save(updated);
    await this.emit(reservationReady(updated));
    return updated;
  }

  async fulfill(tenantId: TenantId, id: Uuid): Promise<Reservation> {
    const updated = fulfillReservation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(reservationFulfilled(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Reservation> {
    const updated = cancelReservation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(reservationCancelled(updated));
    return updated;
  }

  async expire(tenantId: TenantId, id: Uuid): Promise<Reservation> {
    const updated = expireReservation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(reservationExpired(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Reservation> {
    return this.require(tenantId, id);
  }

  async listOpenForTitle(tenantId: TenantId, titleId: Uuid): Promise<Reservation[]> {
    return this.repository.listOpenByTitle(tenantId, titleId);
  }

  async listForMember(tenantId: TenantId, memberId: Uuid): Promise<Reservation[]> {
    return this.repository.listByMember(tenantId, memberId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Reservation> {
    const reservation = await this.repository.findById(tenantId, id);
    if (!reservation) {
      throw new ReservationNotFoundError(id);
    }
    return reservation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
