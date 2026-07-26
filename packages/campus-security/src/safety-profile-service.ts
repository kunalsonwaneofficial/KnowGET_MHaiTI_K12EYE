import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { summarizeAccessActivity } from "./access";
import type { SitePresenceSummary } from "./campus-security-view";
import { safetyProfileRefreshed } from "./campus-security-events";
import { AccessZoneNotFoundError } from "./errors";
import { computeZonePresence, summarizeSitePresence } from "./presence";
import type {
  AccessCredentialRepository,
  AccessEventRepository,
  AccessZoneRepository,
  SafetyProfileRepository,
  SecurityIncidentRepository,
  VisitRepository,
} from "./ports";
import { composeSafetyProfile, refreshSafetyProfile, type SafetyProfile } from "./safety-profile";
import { isIncidentOpen } from "./security-incident";

export interface SafetyProfileServiceDeps {
  readonly repository: SafetyProfileRepository;
  readonly zones: AccessZoneRepository;
  readonly visits: VisitRepository;
  readonly incidents: SecurityIncidentRepository;
  readonly credentials: AccessCredentialRepository;
  readonly accessEvents: AccessEventRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for safety profiles — the per-zone read model. `refresh` recomputes a zone's security
 * posture from its on-site visits (via the presence engine), its open incidents, the active credentials that
 * grant it, and its access events (via the access-activity engine), upserting one row per zone and publishing
 * the refresh event. `summarizeSite` rolls the organization's profiles into a campus presence picture via
 * the pure site-rollup engine.
 */
export class SafetyProfileService {
  private readonly repository: SafetyProfileRepository;
  private readonly zones: AccessZoneRepository;
  private readonly visits: VisitRepository;
  private readonly incidents: SecurityIncidentRepository;
  private readonly credentials: AccessCredentialRepository;
  private readonly accessEvents: AccessEventRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SafetyProfileServiceDeps) {
    this.repository = deps.repository;
    this.zones = deps.zones;
    this.visits = deps.visits;
    this.incidents = deps.incidents;
    this.credentials = deps.credentials;
    this.accessEvents = deps.accessEvents;
    this.events = deps.events;
  }

  async refresh(tenantId: TenantId, zoneId: Uuid, refreshedAt: string): Promise<SafetyProfile> {
    const zone = await this.zones.findById(tenantId, zoneId);
    if (!zone) {
      throw new AccessZoneNotFoundError(zoneId);
    }
    const onSite = await this.visits.listOnSiteByZone(tenantId, zoneId);
    const incidents = await this.incidents.listByZone(tenantId, zoneId);
    const credentials = await this.credentials.listActiveByGrantedZone(tenantId, zoneId);
    const accessEvents = await this.accessEvents.listByZone(tenantId, zoneId);
    const params = {
      tenantId,
      organizationId: zone.organizationId,
      zoneId,
      zoneCode: zone.code,
      zoneName: zone.name,
      securityLevel: zone.securityLevel,
      zoneStatus: zone.status,
      presence: computeZonePresence(onSite, zone.capacity),
      openIncidentCount: incidents.filter(isIncidentOpen).length,
      activeCredentialCount: credentials.length,
      activity: summarizeAccessActivity(accessEvents),
      refreshedAt,
    };
    const existing = await this.repository.findByZone(tenantId, zoneId);
    const profile = existing
      ? refreshSafetyProfile(existing, params)
      : composeSafetyProfile(params);
    await this.repository.save(profile);
    await this.emit(safetyProfileRefreshed(profile));
    return profile;
  }

  async getForZone(tenantId: TenantId, zoneId: Uuid): Promise<SafetyProfile | null> {
    return this.repository.findByZone(tenantId, zoneId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SafetyProfile[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  /** Roll the organization's zone profiles into a campus presence summary. */
  async summarizeSite(tenantId: TenantId, organizationId: Uuid): Promise<SitePresenceSummary> {
    const profiles = await this.repository.listByOrganization(tenantId, organizationId);
    return summarizeSitePresence(
      profiles.map((p) => ({ onSiteCount: p.onSiteVisitorCount, capacity: p.capacity })),
    );
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
