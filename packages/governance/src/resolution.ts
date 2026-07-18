import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateVoteError,
  EmptyResolutionTitleError,
  InvalidResolutionTransitionError,
  VotingNotOpenError,
} from "./errors";

/**
 * Resolution lifecycle: `draft` → `voting` (open for votes) → `approved` or
 * `rejected` (on tally) → `implemented` (approved resolutions only).
 */
export type ResolutionStatus = "draft" | "voting" | "approved" | "rejected" | "implemented";

export type VoteDecision = "for" | "against" | "abstain";

export interface ResolutionVote {
  readonly voterId: Uuid;
  readonly decision: VoteDecision;
  readonly castOn: string;
}

/**
 * A formal decision of a governance body. Drafted as a proposal, opened for voting,
 * tallied to approval or rejection by simple majority, and — once approved — tracked
 * to implementation. The record is the auditable institutional decision memory.
 */
export interface Resolution {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The governance body passing the resolution. */
  readonly governanceBodyId: Uuid;
  readonly title: string;
  readonly proposalText: string;
  readonly proposedById: Uuid;
  readonly status: ResolutionStatus;
  readonly votes: readonly ResolutionVote[];
  readonly effectiveOn: string | null;
  readonly approvedOn: string | null;
  readonly implementedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftResolutionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly governanceBodyId: Uuid;
  readonly title: string;
  readonly proposalText: string;
  readonly proposedById: Uuid;
}

/** Draft a new resolution (rejecting an empty title). */
export function draftResolution(params: DraftResolutionParams): Resolution {
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyResolutionTitleError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    governanceBodyId: params.governanceBodyId,
    title,
    proposalText: params.proposalText,
    proposedById: params.proposedById,
    status: "draft",
    votes: [],
    effectiveOn: null,
    approvedOn: null,
    implementedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (resolution: Resolution, patch: Partial<Resolution>): Resolution => ({
  ...resolution,
  ...patch,
  updatedAt: nowIso(),
});

/** Open a drafted resolution for voting. */
export function openVoting(resolution: Resolution): Resolution {
  if (resolution.status !== "draft") {
    throw new InvalidResolutionTransitionError(resolution.status, "voting");
  }
  return touch(resolution, { status: "voting" });
}

export interface CastVoteParams {
  readonly voterId: Uuid;
  readonly decision: VoteDecision;
  readonly castOn?: string;
}

/** Cast a vote (voting must be open; a voter votes at most once). */
export function castVote(resolution: Resolution, params: CastVoteParams): Resolution {
  if (resolution.status !== "voting") {
    throw new VotingNotOpenError(resolution.id);
  }
  if (resolution.votes.some((v) => v.voterId === params.voterId)) {
    throw new DuplicateVoteError(params.voterId);
  }
  const vote: ResolutionVote = {
    voterId: params.voterId,
    decision: params.decision,
    castOn: params.castOn ?? nowIso().slice(0, 10),
  };
  return touch(resolution, { votes: [...resolution.votes, vote] });
}

export interface VoteTally {
  readonly for: number;
  readonly against: number;
  readonly abstain: number;
}

/** Count the votes by decision. */
export function tallyVotes(resolution: Resolution): VoteTally {
  return resolution.votes.reduce<VoteTally>(
    (acc, v) => ({
      for: acc.for + (v.decision === "for" ? 1 : 0),
      against: acc.against + (v.decision === "against" ? 1 : 0),
      abstain: acc.abstain + (v.decision === "abstain" ? 1 : 0),
    }),
    { for: 0, against: 0, abstain: 0 },
  );
}

/**
 * Close voting and record the outcome: `approved` when the `for` votes strictly
 * outnumber `against`, otherwise `rejected`. Approval stamps the effective date.
 */
export function tallyResolution(
  resolution: Resolution,
  options: { effectiveOn?: string | null; decidedOn?: string | null } = {},
): Resolution {
  if (resolution.status !== "voting") {
    throw new InvalidResolutionTransitionError(resolution.status, "tally");
  }
  const tally = tallyVotes(resolution);
  const decidedOn = options.decidedOn ?? nowIso().slice(0, 10);
  if (tally.for > tally.against) {
    return touch(resolution, {
      status: "approved",
      approvedOn: decidedOn,
      effectiveOn: options.effectiveOn ?? decidedOn,
    });
  }
  return touch(resolution, { status: "rejected" });
}

/** Mark an approved resolution as implemented. */
export function markImplemented(resolution: Resolution, implementedOn?: string | null): Resolution {
  if (resolution.status !== "approved") {
    throw new InvalidResolutionTransitionError(resolution.status, "implemented");
  }
  return touch(resolution, {
    status: "implemented",
    implementedOn: implementedOn ?? nowIso().slice(0, 10),
  });
}

/** True when the resolution has been approved (or already implemented). */
export const isCarried = (resolution: Resolution): boolean =>
  resolution.status === "approved" || resolution.status === "implemented";
