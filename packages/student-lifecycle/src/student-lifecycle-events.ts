import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Applicant } from "./applicant";
import type { LeadSource } from "./lead-source";
import type { Prospect } from "./prospect";

// --- Prospect --------------------------------------------------------------------
export const PROSPECT_CREATED = "student.prospect.created";

export interface ProspectCreatedPayload {
  readonly prospectId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly leadSource: LeadSource;
}

export type ProspectCreatedEvent = DomainEvent<typeof PROSPECT_CREATED, ProspectCreatedPayload>;

export const prospectCreated = (prospect: Prospect): ProspectCreatedEvent =>
  createEvent(
    PROSPECT_CREATED,
    {
      prospectId: prospect.id,
      organizationId: prospect.organizationId,
      personId: prospect.personId,
      leadSource: prospect.leadSource,
    },
    { tenantId: prospect.tenantId },
  );

// --- Applicant -------------------------------------------------------------------
export const APPLICATION_SUBMITTED = "student.application.submitted";
export const APPLICANT_APPROVED = "student.applicant.approved";

export interface ApplicationEventPayload {
  readonly applicantId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly programId: Uuid | null;
}

export type ApplicationSubmittedEvent = DomainEvent<
  typeof APPLICATION_SUBMITTED,
  ApplicationEventPayload
>;
export type ApplicantApprovedEvent = DomainEvent<
  typeof APPLICANT_APPROVED,
  ApplicationEventPayload
>;

const applicationPayload = (applicant: Applicant): ApplicationEventPayload => ({
  applicantId: applicant.id,
  organizationId: applicant.organizationId,
  personId: applicant.personId,
  programId: applicant.programId,
});

export const applicationSubmitted = (applicant: Applicant): ApplicationSubmittedEvent =>
  createEvent(APPLICATION_SUBMITTED, applicationPayload(applicant), {
    tenantId: applicant.tenantId,
  });

export const applicantApproved = (applicant: Applicant): ApplicantApprovedEvent =>
  createEvent(APPLICANT_APPROVED, applicationPayload(applicant), { tenantId: applicant.tenantId });
