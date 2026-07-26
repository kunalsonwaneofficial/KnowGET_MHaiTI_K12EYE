import type { TenantId, Uuid } from "@knowget/types";
import type { AdmissionCycle } from "./admission-cycle";
import type { AdmissionEvaluation } from "./admission-evaluation";
import type { AdmissionsFunnelProfile } from "./admissions-funnel-profile";
import type { Application } from "./application";
import type { EnrollmentConfirmation } from "./enrollment-confirmation";
import type { Lead } from "./lead";
import type { MarketingCampaign } from "./marketing-campaign";
import type { Offer } from "./offer";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Every admissions record attaches to it; the domain links to it and never depends on `@knowget/organization`
 * directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist? An application's applicant is a
 * Person; the domain links to them and never re-models them. The prospect/applicant/student lifecycle records
 * are Student Lifecycle's (P2-D03), referenced by id.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for marketing campaigns. Tenant-scoped (explicit argument + RLS). */
export interface MarketingCampaignRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign | null>;
  findByCode(tenantId: TenantId, code: string): Promise<MarketingCampaign | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MarketingCampaign[]>;
  listByTenant(tenantId: TenantId): Promise<MarketingCampaign[]>;
  save(campaign: MarketingCampaign): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link MarketingCampaignRepository} — the default for tests and bootstrap. */
export class InMemoryMarketingCampaignRepository implements MarketingCampaignRepository {
  private readonly byId = new Map<string, MarketingCampaign>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MarketingCampaign | null> {
    const campaign = this.byId.get(id);
    return campaign && campaign.tenantId === tenantId ? campaign : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<MarketingCampaign | null> {
    return [...this.byId.values()].find((c) => c.tenantId === tenantId && c.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MarketingCampaign[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<MarketingCampaign[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(campaign: MarketingCampaign): Promise<void> {
    this.byId.set(campaign.id, campaign);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const campaign = this.byId.get(id);
    if (campaign && campaign.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for leads. Tenant-scoped (explicit argument + RLS). `countByOrganization` is the
 * top-of-funnel lead volume the funnel engine reads for a cycle in that organization.
 */
export interface LeadRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Lead | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Lead | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Lead[]>;
  countByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<number>;
  listByCampaign(tenantId: TenantId, campaignId: Uuid): Promise<Lead[]>;
  listByTenant(tenantId: TenantId): Promise<Lead[]>;
  save(lead: Lead): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LeadRepository} — the default for tests and bootstrap. */
export class InMemoryLeadRepository implements LeadRepository {
  private readonly byId = new Map<string, Lead>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Lead | null> {
    const lead = this.byId.get(id);
    return lead && lead.tenantId === tenantId ? lead : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Lead | null> {
    return [...this.byId.values()].find((l) => l.tenantId === tenantId && l.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Lead[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.organizationId === organizationId,
    );
  }

  async countByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<number> {
    return (await this.listByOrganization(tenantId, organizationId)).length;
  }

  async listByCampaign(tenantId: TenantId, campaignId: Uuid): Promise<Lead[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.campaignId === campaignId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Lead[]> {
    return [...this.byId.values()].filter((l) => l.tenantId === tenantId);
  }

  async save(lead: Lead): Promise<void> {
    this.byId.set(lead.id, lead);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const lead = this.byId.get(id);
    if (lead && lead.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for admission cycles. Tenant-scoped (explicit argument + RLS). */
export interface AdmissionCycleRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle | null>;
  findByCode(tenantId: TenantId, code: string): Promise<AdmissionCycle | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AdmissionCycle[]>;
  listByTenant(tenantId: TenantId): Promise<AdmissionCycle[]>;
  save(cycle: AdmissionCycle): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AdmissionCycleRepository} — the default for tests and bootstrap. */
export class InMemoryAdmissionCycleRepository implements AdmissionCycleRepository {
  private readonly byId = new Map<string, AdmissionCycle>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AdmissionCycle | null> {
    const cycle = this.byId.get(id);
    return cycle && cycle.tenantId === tenantId ? cycle : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<AdmissionCycle | null> {
    return [...this.byId.values()].find((c) => c.tenantId === tenantId && c.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AdmissionCycle[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AdmissionCycle[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(cycle: AdmissionCycle): Promise<void> {
    this.byId.set(cycle.id, cycle);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const cycle = this.byId.get(id);
    if (cycle && cycle.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for applications. Tenant-scoped (explicit argument + RLS). `listByCycle` and
 * `countByCycle` feed the application-stage tally and the funnel's application count for a cycle.
 */
export interface ApplicationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Application | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Application | null>;
  listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<Application[]>;
  countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Application[]>;
  listByTenant(tenantId: TenantId): Promise<Application[]>;
  save(application: Application): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ApplicationRepository} — the default for tests and bootstrap. */
export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly byId = new Map<string, Application>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Application | null> {
    const application = this.byId.get(id);
    return application && application.tenantId === tenantId ? application : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Application | null> {
    return [...this.byId.values()].find((a) => a.tenantId === tenantId && a.code === code) ?? null;
  }

  async listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<Application[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId && a.cycleId === cycleId);
  }

  async countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number> {
    return (await this.listByCycle(tenantId, cycleId)).length;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Application[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Application[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(application: Application): Promise<void> {
    this.byId.set(application.id, application);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const application = this.byId.get(id);
    if (application && application.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for admission evaluations — an append-only log per application. Tenant-scoped (explicit
 * argument + RLS). There is no `remove`: evaluations are immutable facts.
 */
export interface AdmissionEvaluationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AdmissionEvaluation | null>;
  listByApplication(tenantId: TenantId, applicationId: Uuid): Promise<AdmissionEvaluation[]>;
  countByApplication(tenantId: TenantId, applicationId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<AdmissionEvaluation[]>;
  save(evaluation: AdmissionEvaluation): Promise<void>;
}

/** In-memory {@link AdmissionEvaluationRepository} — the default for tests and bootstrap. */
export class InMemoryAdmissionEvaluationRepository implements AdmissionEvaluationRepository {
  private readonly byId = new Map<string, AdmissionEvaluation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AdmissionEvaluation | null> {
    const evaluation = this.byId.get(id);
    return evaluation && evaluation.tenantId === tenantId ? evaluation : null;
  }

  async listByApplication(tenantId: TenantId, applicationId: Uuid): Promise<AdmissionEvaluation[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.applicationId === applicationId,
    );
  }

  async countByApplication(tenantId: TenantId, applicationId: Uuid): Promise<number> {
    return (await this.listByApplication(tenantId, applicationId)).length;
  }

  async listByTenant(tenantId: TenantId): Promise<AdmissionEvaluation[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(evaluation: AdmissionEvaluation): Promise<void> {
    this.byId.set(evaluation.id, evaluation);
  }
}

/**
 * Storage contract for offers. Tenant-scoped (explicit argument + RLS). `findByApplication` backs the
 * one-offer-per-application rule; `countByCycle` is the funnel's offer count for a cycle.
 */
export interface OfferRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Offer | null>;
  findByApplication(tenantId: TenantId, applicationId: Uuid): Promise<Offer | null>;
  listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<Offer[]>;
  countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<Offer[]>;
  save(offer: Offer): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link OfferRepository} — the default for tests and bootstrap. */
export class InMemoryOfferRepository implements OfferRepository {
  private readonly byId = new Map<string, Offer>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Offer | null> {
    const offer = this.byId.get(id);
    return offer && offer.tenantId === tenantId ? offer : null;
  }

  async findByApplication(tenantId: TenantId, applicationId: Uuid): Promise<Offer | null> {
    return (
      [...this.byId.values()].find(
        (o) => o.tenantId === tenantId && o.applicationId === applicationId,
      ) ?? null
    );
  }

  async listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<Offer[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId && o.cycleId === cycleId);
  }

  async countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number> {
    return (await this.listByCycle(tenantId, cycleId)).length;
  }

  async listByTenant(tenantId: TenantId): Promise<Offer[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async save(offer: Offer): Promise<void> {
    this.byId.set(offer.id, offer);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const offer = this.byId.get(id);
    if (offer && offer.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for enrollment confirmations — the immutable close of the funnel. Tenant-scoped (explicit
 * argument + RLS). `findByOffer` backs the one-confirmation-per-offer rule; `listByCycle`/`countByCycle` feed
 * the funnel's enrollment count and the per-grade intake rollup. There is no `remove`: confirmations are
 * immutable facts.
 */
export interface EnrollmentConfirmationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EnrollmentConfirmation | null>;
  findByOffer(tenantId: TenantId, offerId: Uuid): Promise<EnrollmentConfirmation | null>;
  listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<EnrollmentConfirmation[]>;
  countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number>;
  listByTenant(tenantId: TenantId): Promise<EnrollmentConfirmation[]>;
  save(confirmation: EnrollmentConfirmation): Promise<void>;
}

/** In-memory {@link EnrollmentConfirmationRepository} — the default for tests and bootstrap. */
export class InMemoryEnrollmentConfirmationRepository implements EnrollmentConfirmationRepository {
  private readonly byId = new Map<string, EnrollmentConfirmation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EnrollmentConfirmation | null> {
    const confirmation = this.byId.get(id);
    return confirmation && confirmation.tenantId === tenantId ? confirmation : null;
  }

  async findByOffer(tenantId: TenantId, offerId: Uuid): Promise<EnrollmentConfirmation | null> {
    return (
      [...this.byId.values()].find((c) => c.tenantId === tenantId && c.offerId === offerId) ?? null
    );
  }

  async listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<EnrollmentConfirmation[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId && c.cycleId === cycleId);
  }

  async countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number> {
    return (await this.listByCycle(tenantId, cycleId)).length;
  }

  async listByTenant(tenantId: TenantId): Promise<EnrollmentConfirmation[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(confirmation: EnrollmentConfirmation): Promise<void> {
    this.byId.set(confirmation.id, confirmation);
  }
}

/**
 * Storage contract for admissions funnel profiles — the derived per-cycle projection. Tenant-scoped (explicit
 * argument + RLS). One profile per cycle (`findByCycle`); the refresh spine upserts through `save`.
 */
export interface AdmissionsFunnelProfileRepository {
  findByCycle(tenantId: TenantId, cycleId: Uuid): Promise<AdmissionsFunnelProfile | null>;
  listByTenant(tenantId: TenantId): Promise<AdmissionsFunnelProfile[]>;
  save(profile: AdmissionsFunnelProfile): Promise<void>;
}

/** In-memory {@link AdmissionsFunnelProfileRepository} — the default for tests and bootstrap. */
export class InMemoryAdmissionsFunnelProfileRepository implements AdmissionsFunnelProfileRepository {
  private readonly byCycle = new Map<string, AdmissionsFunnelProfile>();

  private key(tenantId: TenantId, cycleId: Uuid): string {
    return `${tenantId}:${cycleId}`;
  }

  async findByCycle(tenantId: TenantId, cycleId: Uuid): Promise<AdmissionsFunnelProfile | null> {
    return this.byCycle.get(this.key(tenantId, cycleId)) ?? null;
  }

  async listByTenant(tenantId: TenantId): Promise<AdmissionsFunnelProfile[]> {
    return [...this.byCycle.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: AdmissionsFunnelProfile): Promise<void> {
    this.byCycle.set(this.key(profile.tenantId, profile.cycleId), profile);
  }
}
