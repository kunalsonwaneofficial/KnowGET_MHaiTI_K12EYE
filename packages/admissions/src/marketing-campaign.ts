import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyCampaignCodeError,
  EmptyCampaignNameError,
  InvalidCampaignTransitionError,
} from "./errors";
import type { CampaignChannel, CampaignStatus } from "./admissions-value";

/**
 * A marketing campaign — a drive to attract prospective families through a channel, over an optional period.
 * It runs `draft → active → completed`, with `cancelled` reachable from a pre-completed state; leads may be
 * attributed to it. Marketing message _delivery_ over channels is the notifications (P1-M05) / engagement
 * (P2-D22) concern — this aggregate records the campaign, not the send.
 */
export interface MarketingCampaign {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly channel: CampaignChannel;
  readonly startOn: string | null;
  readonly endOn: string | null;
  readonly status: CampaignStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateMarketingCampaignParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly channel: CampaignChannel;
  readonly startOn?: string | null;
  readonly endOn?: string | null;
}

/** Create a marketing campaign (status `draft`). Code and name required. */
export function createMarketingCampaign(params: CreateMarketingCampaignParams): MarketingCampaign {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyCampaignCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyCampaignNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    channel: params.channel,
    startOn: params.startOn?.trim() || null,
    endOn: params.endOn?.trim() || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  campaign: MarketingCampaign,
  patch: Partial<MarketingCampaign>,
): MarketingCampaign => ({
  ...campaign,
  ...patch,
  updatedAt: nowIso(),
});

const requireNotTerminal = (campaign: MarketingCampaign, to: string): void => {
  if (campaign.status === "completed" || campaign.status === "cancelled") {
    throw new InvalidCampaignTransitionError(campaign.status, to);
  }
};

/** Rename a campaign; not allowed once completed or cancelled. */
export function renameCampaign(campaign: MarketingCampaign, name: string): MarketingCampaign {
  requireNotTerminal(campaign, "renamed");
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyCampaignNameError();
  }
  return touch(campaign, { name: trimmed });
}

/** Set the campaign's channel; not allowed once completed or cancelled. */
export function setCampaignChannel(
  campaign: MarketingCampaign,
  channel: CampaignChannel,
): MarketingCampaign {
  requireNotTerminal(campaign, "channel-set");
  return touch(campaign, { channel });
}

/** Set the campaign's run period; not allowed once completed or cancelled. */
export function setCampaignPeriod(
  campaign: MarketingCampaign,
  startOn: string | null,
  endOn: string | null,
): MarketingCampaign {
  requireNotTerminal(campaign, "period-set");
  return touch(campaign, { startOn: startOn?.trim() || null, endOn: endOn?.trim() || null });
}

/** Activate a draft campaign (→ `active`). */
export function activateCampaign(campaign: MarketingCampaign): MarketingCampaign {
  if (campaign.status !== "draft") {
    throw new InvalidCampaignTransitionError(campaign.status, "active");
  }
  return touch(campaign, { status: "active" });
}

/** Complete an active campaign (→ `completed`, terminal). */
export function completeCampaign(campaign: MarketingCampaign): MarketingCampaign {
  if (campaign.status !== "active") {
    throw new InvalidCampaignTransitionError(campaign.status, "completed");
  }
  return touch(campaign, { status: "completed" });
}

/** Cancel a pre-completed campaign (→ `cancelled`, terminal). */
export function cancelCampaign(campaign: MarketingCampaign): MarketingCampaign {
  requireNotTerminal(campaign, "cancelled");
  return touch(campaign, { status: "cancelled" });
}

/** Whether the campaign is active. */
export const isCampaignActive = (campaign: MarketingCampaign): boolean =>
  campaign.status === "active";
