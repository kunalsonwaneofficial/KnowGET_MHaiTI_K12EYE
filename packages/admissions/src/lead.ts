import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyLeadCodeError,
  EmptyLeadContactNameError,
  InvalidLeadTransitionError,
} from "./errors";
import { type CampaignChannel, type LeadStatus, OPEN_LEAD_STATUSES } from "./admissions-value";

const OPEN_LEAD = new Set<string>(OPEN_LEAD_STATUSES);

/**
 * A lead — an inbound inquiry from a prospective family, the top of the admissions funnel. It carries a
 * contact name and optional phone/email, an acquisition source and an optional attributed campaign, and runs
 * `new → contacted → qualified → converted`, with `lost` reachable from any open state. Converting a lead is
 * the funnel bridge to an application (and, upstream, a prospect in Student Lifecycle P2-D03). The contact
 * details are held here, never on an event.
 */
export interface Lead {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly contactName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly source: CampaignChannel;
  readonly campaignId: Uuid | null;
  readonly status: LeadStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateLeadParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly contactName: string;
  readonly source: CampaignChannel;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly campaignId?: Uuid | null;
}

/** Create a lead (status `new`). Code and contact name required. */
export function createLead(params: CreateLeadParams): Lead {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyLeadCodeError();
  }
  const contactName = params.contactName.trim();
  if (contactName.length === 0) {
    throw new EmptyLeadContactNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    contactName,
    phone: params.phone?.trim() || null,
    email: params.email?.trim() || null,
    source: params.source,
    campaignId: params.campaignId ?? null,
    status: "new",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (lead: Lead, patch: Partial<Lead>): Lead => ({
  ...lead,
  ...patch,
  updatedAt: nowIso(),
});

const requireOpen = (lead: Lead, to: string): void => {
  if (!OPEN_LEAD.has(lead.status)) {
    throw new InvalidLeadTransitionError(lead.status, to);
  }
};

/** Update a lead's contact phone/email; only while open. */
export function updateLeadContact(lead: Lead, phone: string | null, email: string | null): Lead {
  requireOpen(lead, "contact-updated");
  return touch(lead, { phone: phone?.trim() || null, email: email?.trim() || null });
}

/** Mark a new lead contacted (`new → contacted`). */
export function contactLead(lead: Lead): Lead {
  if (lead.status !== "new") {
    throw new InvalidLeadTransitionError(lead.status, "contacted");
  }
  return touch(lead, { status: "contacted" });
}

/** Qualify a lead (`new`/`contacted → qualified`). */
export function qualifyLead(lead: Lead): Lead {
  if (lead.status !== "new" && lead.status !== "contacted") {
    throw new InvalidLeadTransitionError(lead.status, "qualified");
  }
  return touch(lead, { status: "qualified" });
}

/** Convert a qualified lead (`qualified → converted`, terminal). */
export function convertLead(lead: Lead): Lead {
  if (lead.status !== "qualified") {
    throw new InvalidLeadTransitionError(lead.status, "converted");
  }
  return touch(lead, { status: "converted" });
}

/** Mark an open lead lost (→ `lost`, terminal). */
export function loseLead(lead: Lead): Lead {
  requireOpen(lead, "lost");
  return touch(lead, { status: "lost" });
}

/** Whether the lead is still open (in play). */
export const isLeadOpen = (lead: Lead): boolean => OPEN_LEAD.has(lead.status);
