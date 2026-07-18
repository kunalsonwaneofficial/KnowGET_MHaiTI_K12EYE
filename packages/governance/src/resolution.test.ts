import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  DuplicateVoteError,
  EmptyResolutionTitleError,
  InvalidResolutionTransitionError,
  VotingNotOpenError,
} from "./errors";
import {
  castVote,
  draftResolution,
  isCarried,
  markImplemented,
  openVoting,
  tallyResolution,
  tallyVotes,
} from "./resolution";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const BODY = "33333333-3333-3333-3333-333333333333" as Uuid;
const PROPOSER = "44444444-4444-4444-4444-444444444444" as Uuid;
const V1 = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;
const V2 = "aaaaaaaa-0000-0000-0000-000000000002" as Uuid;
const V3 = "aaaaaaaa-0000-0000-0000-000000000003" as Uuid;

const draft = () =>
  draftResolution({
    tenantId: TENANT,
    organizationId: ORG,
    governanceBodyId: BODY,
    title: "Adopt the 2026-27 Academic Calendar",
    proposalText: "Resolved that the calendar be adopted.",
    proposedById: PROPOSER,
  });

describe("Resolution", () => {
  it("drafts a resolution and rejects an empty title", () => {
    expect(draft().status).toBe("draft");
    expect(() =>
      draftResolution({
        tenantId: TENANT,
        organizationId: ORG,
        governanceBodyId: BODY,
        title: "  ",
        proposalText: "x",
        proposedById: PROPOSER,
      }),
    ).toThrow(EmptyResolutionTitleError);
  });

  it("rejects votes before voting is open and after it is drafted", () => {
    expect(() => castVote(draft(), { voterId: V1, decision: "for" })).toThrow(VotingNotOpenError);
  });

  it("collects votes, rejecting a duplicate voter", () => {
    let r = openVoting(draft());
    r = castVote(r, { voterId: V1, decision: "for" });
    expect(() => castVote(r, { voterId: V1, decision: "against" })).toThrow(DuplicateVoteError);
    r = castVote(r, { voterId: V2, decision: "against" });
    r = castVote(r, { voterId: V3, decision: "abstain" });
    expect(tallyVotes(r)).toEqual({ for: 1, against: 1, abstain: 1 });
  });

  it("approves on a majority and tracks implementation", () => {
    let r = openVoting(draft());
    r = castVote(r, { voterId: V1, decision: "for" });
    r = castVote(r, { voterId: V2, decision: "for" });
    r = castVote(r, { voterId: V3, decision: "against" });
    r = tallyResolution(r, { effectiveOn: "2026-08-01" });
    expect(r.status).toBe("approved");
    expect(r.effectiveOn).toBe("2026-08-01");
    expect(isCarried(r)).toBe(true);
    const implemented = markImplemented(r, "2026-08-15");
    expect(implemented.status).toBe("implemented");
    expect(implemented.implementedOn).toBe("2026-08-15");
  });

  it("rejects when for does not outnumber against", () => {
    let r = openVoting(draft());
    r = castVote(r, { voterId: V1, decision: "for" });
    r = castVote(r, { voterId: V2, decision: "against" });
    r = tallyResolution(r);
    expect(r.status).toBe("rejected");
    expect(() => markImplemented(r)).toThrow(InvalidResolutionTransitionError);
  });
});
