import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  AccessZoneNotFoundError,
  PersonNotFoundForSecurityError,
  VisitNotFoundError,
  VisitorNotActiveError,
  VisitorNotFoundError,
} from "./errors";
import {
  visitApproved,
  visitCancelled,
  visitCheckedIn,
  visitCheckedOut,
  visitDenied,
  visitExpired,
  visitRequested,
  visitZoneSet,
} from "./campus-security-events";
import { isVisitorActive, type Visitor } from "./visitor";
import type {
  AccessZoneRepository,
  PersonDirectory,
  VisitRepository,
  VisitorRepository,
} from "./ports";
import {
  approveVisit,
  cancelVisit,
  checkInVisit,
  checkOutVisit,
  denyVisit,
  expireVisit,
  type RequestVisitParams,
  requestVisit,
  setVisitZone,
  type Visit,
} from "./visit";

/** The request input — the organization is derived from the visitor, not supplied. */
export type RequestVisitInput = Omit<RequestVisitParams, "organizationId">;

export interface VisitServiceDeps {
  readonly repository: VisitRepository;
  readonly visitors: VisitorRepository;
  readonly persons: PersonDirectory;
  readonly zones: AccessZoneRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for visits. Requests a visit (validating an active visitor, an existing host Person and
 * an existing destination zone), approves/denies it, checks the visitor in and out, and cancels/expires an
 * unstarted visit, publishing the visit events. A blocked or archived visitor cannot have a visit requested
 * or approved.
 */
export class VisitService {
  private readonly repository: VisitRepository;
  private readonly visitors: VisitorRepository;
  private readonly persons: PersonDirectory;
  private readonly zones: AccessZoneRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: VisitServiceDeps) {
    this.repository = deps.repository;
    this.visitors = deps.visitors;
    this.persons = deps.persons;
    this.zones = deps.zones;
    this.events = deps.events;
  }

  async request(input: RequestVisitInput): Promise<Visit> {
    const visitor = await this.requireActiveVisitor(input.tenantId, input.visitorId);
    if (!(await this.persons.exists(input.tenantId, input.hostPersonId))) {
      throw new PersonNotFoundForSecurityError(input.hostPersonId);
    }
    if (input.zoneId) {
      await this.requireZone(input.tenantId, input.zoneId);
    }
    const visit = requestVisit({ ...input, organizationId: visitor.organizationId });
    await this.repository.save(visit);
    await this.emit(visitRequested(visit));
    return visit;
  }

  async setZone(tenantId: TenantId, id: Uuid, zoneId: Uuid | null): Promise<Visit> {
    if (zoneId) {
      await this.requireZone(tenantId, zoneId);
    }
    const updated = setVisitZone(await this.require(tenantId, id), zoneId);
    await this.repository.save(updated);
    await this.emit(visitZoneSet(updated));
    return updated;
  }

  async approve(tenantId: TenantId, id: Uuid): Promise<Visit> {
    const visit = await this.require(tenantId, id);
    await this.requireActiveVisitor(tenantId, visit.visitorId);
    const updated = approveVisit(visit);
    await this.repository.save(updated);
    await this.emit(visitApproved(updated));
    return updated;
  }

  async deny(tenantId: TenantId, id: Uuid): Promise<Visit> {
    const updated = denyVisit(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(visitDenied(updated));
    return updated;
  }

  async checkIn(tenantId: TenantId, id: Uuid, checkedInAt: string): Promise<Visit> {
    const updated = checkInVisit(await this.require(tenantId, id), checkedInAt);
    await this.repository.save(updated);
    await this.emit(visitCheckedIn(updated));
    return updated;
  }

  async checkOut(tenantId: TenantId, id: Uuid, checkedOutAt: string): Promise<Visit> {
    const updated = checkOutVisit(await this.require(tenantId, id), checkedOutAt);
    await this.repository.save(updated);
    await this.emit(visitCheckedOut(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Visit> {
    const updated = cancelVisit(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(visitCancelled(updated));
    return updated;
  }

  async expire(tenantId: TenantId, id: Uuid): Promise<Visit> {
    const updated = expireVisit(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(visitExpired(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Visit> {
    return this.require(tenantId, id);
  }

  async listForVisitor(tenantId: TenantId, visitorId: Uuid): Promise<Visit[]> {
    return this.repository.listByVisitor(tenantId, visitorId);
  }

  async listForHost(tenantId: TenantId, hostPersonId: Uuid): Promise<Visit[]> {
    return this.repository.listByHost(tenantId, hostPersonId);
  }

  async listForZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]> {
    return this.repository.listByZone(tenantId, zoneId);
  }

  async listOnSiteForZone(tenantId: TenantId, zoneId: Uuid): Promise<Visit[]> {
    return this.repository.listOnSiteByZone(tenantId, zoneId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visit[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listOpen(tenantId: TenantId): Promise<Visit[]> {
    return this.repository.listOpen(tenantId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Visit> {
    const visit = await this.repository.findById(tenantId, id);
    if (!visit) {
      throw new VisitNotFoundError(id);
    }
    return visit;
  }

  private async requireActiveVisitor(tenantId: TenantId, visitorId: Uuid): Promise<Visitor> {
    const visitor = await this.visitors.findById(tenantId, visitorId);
    if (!visitor) {
      throw new VisitorNotFoundError(visitorId);
    }
    if (!isVisitorActive(visitor)) {
      throw new VisitorNotActiveError(visitorId);
    }
    return visitor;
  }

  private async requireZone(tenantId: TenantId, zoneId: Uuid): Promise<void> {
    if (!(await this.zones.findById(tenantId, zoneId))) {
      throw new AccessZoneNotFoundError(zoneId);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
