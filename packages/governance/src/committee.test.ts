import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  appointMember,
  changeMemberRole,
  createCommittee,
  dissolveCommittee,
  isActiveCommittee,
  removeMember,
  roleHolder,
} from "./committee";
import {
  CommitteeMemberNotFoundError,
  CommitteeRoleConflictError,
  DuplicateCommitteeMemberError,
  EmptyCommitteeNameError,
  InvalidCommitteeTransitionError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;
const BOB = "aaaaaaaa-0000-0000-0000-000000000002" as Uuid;

const make = () =>
  createCommittee({ tenantId: TENANT, organizationId: ORG, name: "Disciplinary Committee" });

describe("Committee", () => {
  it("creates an active committee with no members", () => {
    const committee = make();
    expect(committee.status).toBe("active");
    expect(committee.members).toEqual([]);
    expect(isActiveCommittee(committee)).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(() => createCommittee({ tenantId: TENANT, organizationId: ORG, name: "  " })).toThrow(
      EmptyCommitteeNameError,
    );
  });

  it("appoints members and enforces a single chair", () => {
    let committee = appointMember(make(), { personId: ALICE, role: "chair" });
    expect(roleHolder(committee, "chair")?.personId).toBe(ALICE);
    expect(() => appointMember(committee, { personId: BOB, role: "chair" })).toThrow(
      CommitteeRoleConflictError,
    );
    committee = appointMember(committee, { personId: BOB, role: "member" });
    expect(committee.members).toHaveLength(2);
  });

  it("rejects a duplicate member", () => {
    const committee = appointMember(make(), { personId: ALICE, role: "member" });
    expect(() => appointMember(committee, { personId: ALICE, role: "secretary" })).toThrow(
      DuplicateCommitteeMemberError,
    );
  });

  it("removes members and rejects removing a non-member", () => {
    const committee = appointMember(make(), { personId: ALICE, role: "member" });
    expect(removeMember(committee, ALICE).members).toEqual([]);
    expect(() => removeMember(committee, BOB)).toThrow(CommitteeMemberNotFoundError);
  });

  it("changes a member's role, re-checking uniqueness", () => {
    let committee = appointMember(make(), { personId: ALICE, role: "member" });
    committee = appointMember(committee, { personId: BOB, role: "chair" });
    expect(() => changeMemberRole(committee, ALICE, "chair")).toThrow(CommitteeRoleConflictError);
    committee = changeMemberRole(committee, ALICE, "secretary");
    expect(roleHolder(committee, "secretary")?.personId).toBe(ALICE);
  });

  it("dissolves an active committee and blocks a second dissolution", () => {
    const dissolved = dissolveCommittee(make());
    expect(dissolved.status).toBe("dissolved");
    expect(() => dissolveCommittee(dissolved)).toThrow(InvalidCommitteeTransitionError);
  });
});
