import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AdmissionCycle } from "./admission-cycle";
import type { Application } from "./application";
import type { Lead } from "./lead";
import type { MarketingCampaign } from "./marketing-campaign";

/**
 * Domain events for the Admissions, Marketing, Enrollment & Growth Platform (P2-D23), on the `admissions.*`
 * namespace. Payloads carry ids, non-sensitive metadata (a code, a channel/source, a status, a stage, a
 * grade) and counts — never money, and never free text or PII: no campaign name, no lead contact name/phone/
 * email, no applicant identity beyond an id.
 */

// --- Marketing campaign ----------------------------------------------------------
export const CAMPAIGN_CREATED = "admissions.campaign.created";
export const CAMPAIGN_RENAMED = "admissions.campaign.renamed";
export const CAMPAIGN_CHANNEL_SET = "admissions.campaign.channel_set";
export const CAMPAIGN_PERIOD_SET = "admissions.campaign.period_set";
export const CAMPAIGN_ACTIVATED = "admissions.campaign.activated";
export const CAMPAIGN_COMPLETED = "admissions.campaign.completed";
export const CAMPAIGN_CANCELLED = "admissions.campaign.cancelled";

export interface CampaignEventPayload {
  readonly campaignId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly channel: string;
  readonly status: string;
}

export type CampaignCreatedEvent = DomainEvent<typeof CAMPAIGN_CREATED, CampaignEventPayload>;
export type CampaignRenamedEvent = DomainEvent<typeof CAMPAIGN_RENAMED, CampaignEventPayload>;
export type CampaignChannelSetEvent = DomainEvent<
  typeof CAMPAIGN_CHANNEL_SET,
  CampaignEventPayload
>;
export type CampaignPeriodSetEvent = DomainEvent<typeof CAMPAIGN_PERIOD_SET, CampaignEventPayload>;
export type CampaignActivatedEvent = DomainEvent<typeof CAMPAIGN_ACTIVATED, CampaignEventPayload>;
export type CampaignCompletedEvent = DomainEvent<typeof CAMPAIGN_COMPLETED, CampaignEventPayload>;
export type CampaignCancelledEvent = DomainEvent<typeof CAMPAIGN_CANCELLED, CampaignEventPayload>;

const campaignPayload = (campaign: MarketingCampaign): CampaignEventPayload => ({
  campaignId: campaign.id,
  organizationId: campaign.organizationId,
  code: campaign.code,
  channel: campaign.channel,
  status: campaign.status,
});

export const campaignCreated = (c: MarketingCampaign): CampaignCreatedEvent =>
  createEvent(CAMPAIGN_CREATED, campaignPayload(c), { tenantId: c.tenantId });
export const campaignRenamed = (c: MarketingCampaign): CampaignRenamedEvent =>
  createEvent(CAMPAIGN_RENAMED, campaignPayload(c), { tenantId: c.tenantId });
export const campaignChannelSet = (c: MarketingCampaign): CampaignChannelSetEvent =>
  createEvent(CAMPAIGN_CHANNEL_SET, campaignPayload(c), { tenantId: c.tenantId });
export const campaignPeriodSet = (c: MarketingCampaign): CampaignPeriodSetEvent =>
  createEvent(CAMPAIGN_PERIOD_SET, campaignPayload(c), { tenantId: c.tenantId });
export const campaignActivated = (c: MarketingCampaign): CampaignActivatedEvent =>
  createEvent(CAMPAIGN_ACTIVATED, campaignPayload(c), { tenantId: c.tenantId });
export const campaignCompleted = (c: MarketingCampaign): CampaignCompletedEvent =>
  createEvent(CAMPAIGN_COMPLETED, campaignPayload(c), { tenantId: c.tenantId });
export const campaignCancelled = (c: MarketingCampaign): CampaignCancelledEvent =>
  createEvent(CAMPAIGN_CANCELLED, campaignPayload(c), { tenantId: c.tenantId });

// --- Lead ------------------------------------------------------------------------
export const LEAD_CREATED = "admissions.lead.created";
export const LEAD_CONTACT_UPDATED = "admissions.lead.contact_updated";
export const LEAD_CONTACTED = "admissions.lead.contacted";
export const LEAD_QUALIFIED = "admissions.lead.qualified";
export const LEAD_CONVERTED = "admissions.lead.converted";
export const LEAD_LOST = "admissions.lead.lost";

export interface LeadEventPayload {
  readonly leadId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly source: string;
  readonly campaignId: Uuid | null;
  readonly status: string;
}

export type LeadCreatedEvent = DomainEvent<typeof LEAD_CREATED, LeadEventPayload>;
export type LeadContactUpdatedEvent = DomainEvent<typeof LEAD_CONTACT_UPDATED, LeadEventPayload>;
export type LeadContactedEvent = DomainEvent<typeof LEAD_CONTACTED, LeadEventPayload>;
export type LeadQualifiedEvent = DomainEvent<typeof LEAD_QUALIFIED, LeadEventPayload>;
export type LeadConvertedEvent = DomainEvent<typeof LEAD_CONVERTED, LeadEventPayload>;
export type LeadLostEvent = DomainEvent<typeof LEAD_LOST, LeadEventPayload>;

const leadPayload = (lead: Lead): LeadEventPayload => ({
  leadId: lead.id,
  organizationId: lead.organizationId,
  code: lead.code,
  source: lead.source,
  campaignId: lead.campaignId,
  status: lead.status,
});

export const leadCreated = (l: Lead): LeadCreatedEvent =>
  createEvent(LEAD_CREATED, leadPayload(l), { tenantId: l.tenantId });
export const leadContactUpdated = (l: Lead): LeadContactUpdatedEvent =>
  createEvent(LEAD_CONTACT_UPDATED, leadPayload(l), { tenantId: l.tenantId });
export const leadContacted = (l: Lead): LeadContactedEvent =>
  createEvent(LEAD_CONTACTED, leadPayload(l), { tenantId: l.tenantId });
export const leadQualified = (l: Lead): LeadQualifiedEvent =>
  createEvent(LEAD_QUALIFIED, leadPayload(l), { tenantId: l.tenantId });
export const leadConverted = (l: Lead): LeadConvertedEvent =>
  createEvent(LEAD_CONVERTED, leadPayload(l), { tenantId: l.tenantId });
export const leadLost = (l: Lead): LeadLostEvent =>
  createEvent(LEAD_LOST, leadPayload(l), { tenantId: l.tenantId });

// --- Admission cycle -------------------------------------------------------------
export const CYCLE_CREATED = "admissions.cycle.created";
export const CYCLE_RENAMED = "admissions.cycle.renamed";
export const CYCLE_SEAT_PLAN_SET = "admissions.cycle.seat_plan_set";
export const CYCLE_WINDOW_SET = "admissions.cycle.window_set";
export const CYCLE_OPENED = "admissions.cycle.opened";
export const CYCLE_CLOSED = "admissions.cycle.closed";
export const CYCLE_ARCHIVED = "admissions.cycle.archived";

export interface CycleEventPayload {
  readonly cycleId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly gradeCount: number;
  readonly seatTotal: number;
  readonly status: string;
}

export type CycleCreatedEvent = DomainEvent<typeof CYCLE_CREATED, CycleEventPayload>;
export type CycleRenamedEvent = DomainEvent<typeof CYCLE_RENAMED, CycleEventPayload>;
export type CycleSeatPlanSetEvent = DomainEvent<typeof CYCLE_SEAT_PLAN_SET, CycleEventPayload>;
export type CycleWindowSetEvent = DomainEvent<typeof CYCLE_WINDOW_SET, CycleEventPayload>;
export type CycleOpenedEvent = DomainEvent<typeof CYCLE_OPENED, CycleEventPayload>;
export type CycleClosedEvent = DomainEvent<typeof CYCLE_CLOSED, CycleEventPayload>;
export type CycleArchivedEvent = DomainEvent<typeof CYCLE_ARCHIVED, CycleEventPayload>;

const cyclePayload = (cycle: AdmissionCycle): CycleEventPayload => ({
  cycleId: cycle.id,
  organizationId: cycle.organizationId,
  code: cycle.code,
  gradeCount: cycle.gradeCapacities.length,
  seatTotal: cycle.gradeCapacities.reduce((sum, gc) => sum + gc.capacity, 0),
  status: cycle.status,
});

export const cycleCreated = (c: AdmissionCycle): CycleCreatedEvent =>
  createEvent(CYCLE_CREATED, cyclePayload(c), { tenantId: c.tenantId });
export const cycleRenamed = (c: AdmissionCycle): CycleRenamedEvent =>
  createEvent(CYCLE_RENAMED, cyclePayload(c), { tenantId: c.tenantId });
export const cycleSeatPlanSet = (c: AdmissionCycle): CycleSeatPlanSetEvent =>
  createEvent(CYCLE_SEAT_PLAN_SET, cyclePayload(c), { tenantId: c.tenantId });
export const cycleWindowSet = (c: AdmissionCycle): CycleWindowSetEvent =>
  createEvent(CYCLE_WINDOW_SET, cyclePayload(c), { tenantId: c.tenantId });
export const cycleOpened = (c: AdmissionCycle): CycleOpenedEvent =>
  createEvent(CYCLE_OPENED, cyclePayload(c), { tenantId: c.tenantId });
export const cycleClosed = (c: AdmissionCycle): CycleClosedEvent =>
  createEvent(CYCLE_CLOSED, cyclePayload(c), { tenantId: c.tenantId });
export const cycleArchived = (c: AdmissionCycle): CycleArchivedEvent =>
  createEvent(CYCLE_ARCHIVED, cyclePayload(c), { tenantId: c.tenantId });

// --- Application -----------------------------------------------------------------
export const APPLICATION_SUBMITTED = "admissions.application.submitted";
export const APPLICATION_REVIEW_STARTED = "admissions.application.review_started";
export const APPLICATION_INTERVIEW_SCHEDULED = "admissions.application.interview_scheduled";
export const APPLICATION_OFFERED = "admissions.application.offered";
export const APPLICATION_WAITLISTED = "admissions.application.waitlisted";
export const APPLICATION_REJECTED = "admissions.application.rejected";
export const APPLICATION_WITHDRAWN = "admissions.application.withdrawn";

export interface ApplicationEventPayload {
  readonly applicationId: Uuid;
  readonly organizationId: Uuid;
  readonly cycleId: Uuid;
  readonly applicantPersonId: Uuid;
  readonly gradeApplyingFor: string;
  readonly status: string;
}

export type ApplicationSubmittedEvent = DomainEvent<
  typeof APPLICATION_SUBMITTED,
  ApplicationEventPayload
>;
export type ApplicationReviewStartedEvent = DomainEvent<
  typeof APPLICATION_REVIEW_STARTED,
  ApplicationEventPayload
>;
export type ApplicationInterviewScheduledEvent = DomainEvent<
  typeof APPLICATION_INTERVIEW_SCHEDULED,
  ApplicationEventPayload
>;
export type ApplicationOfferedEvent = DomainEvent<
  typeof APPLICATION_OFFERED,
  ApplicationEventPayload
>;
export type ApplicationWaitlistedEvent = DomainEvent<
  typeof APPLICATION_WAITLISTED,
  ApplicationEventPayload
>;
export type ApplicationRejectedEvent = DomainEvent<
  typeof APPLICATION_REJECTED,
  ApplicationEventPayload
>;
export type ApplicationWithdrawnEvent = DomainEvent<
  typeof APPLICATION_WITHDRAWN,
  ApplicationEventPayload
>;

const applicationPayload = (application: Application): ApplicationEventPayload => ({
  applicationId: application.id,
  organizationId: application.organizationId,
  cycleId: application.cycleId,
  applicantPersonId: application.applicantPersonId,
  gradeApplyingFor: application.gradeApplyingFor,
  status: application.status,
});

export const applicationSubmitted = (a: Application): ApplicationSubmittedEvent =>
  createEvent(APPLICATION_SUBMITTED, applicationPayload(a), { tenantId: a.tenantId });
export const applicationReviewStarted = (a: Application): ApplicationReviewStartedEvent =>
  createEvent(APPLICATION_REVIEW_STARTED, applicationPayload(a), { tenantId: a.tenantId });
export const applicationInterviewScheduled = (a: Application): ApplicationInterviewScheduledEvent =>
  createEvent(APPLICATION_INTERVIEW_SCHEDULED, applicationPayload(a), { tenantId: a.tenantId });
export const applicationOffered = (a: Application): ApplicationOfferedEvent =>
  createEvent(APPLICATION_OFFERED, applicationPayload(a), { tenantId: a.tenantId });
export const applicationWaitlisted = (a: Application): ApplicationWaitlistedEvent =>
  createEvent(APPLICATION_WAITLISTED, applicationPayload(a), { tenantId: a.tenantId });
export const applicationRejected = (a: Application): ApplicationRejectedEvent =>
  createEvent(APPLICATION_REJECTED, applicationPayload(a), { tenantId: a.tenantId });
export const applicationWithdrawn = (a: Application): ApplicationWithdrawnEvent =>
  createEvent(APPLICATION_WITHDRAWN, applicationPayload(a), { tenantId: a.tenantId });
