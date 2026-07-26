import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  isMembershipActive,
  joinChapterMembership,
  leaveChapterMembership,
  reactivateMembership,
  setMembershipRole,
} from "./chapter-membership";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const chapterId = "33333333-3333-3333-3333-333333333333" as Uuid;
const alumniProfileId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  joinChapterMembership({
    tenantId,
    organizationId,
    chapterId,
    alumniProfileId,
    joinedOn: "2026-01-10",
  });

describe("ChapterMembership", () => {
  it("joins active as member, changes role, leaves and reactivates", () => {
    let m = make();
    expect(m.status).toBe("active");
    expect(m.role).toBe("member");
    expect(isMembershipActive(m)).toBe(true);
    m = setMembershipRole(m, "officer");
    expect(m.role).toBe("officer");
    m = leaveChapterMembership(m, "2026-06-01");
    expect(m.status).toBe("left");
    expect(m.leftOn).toBe("2026-06-01");
    m = reactivateMembership(m, "2026-09-01", "lead");
    expect(m.status).toBe("active");
    expect(m.leftOn).toBeNull();
    expect(m.joinedOn).toBe("2026-09-01");
    expect(m.role).toBe("lead"); // an optional role on rejoin is applied
  });

  it("keeps the prior role on reactivation when no new role is given", () => {
    const officer = setMembershipRole(make(), "officer");
    const left = leaveChapterMembership(officer, "2026-06-01");
    expect(reactivateMembership(left, "2026-09-01").role).toBe("officer");
  });

  it("guards transitions", () => {
    expect(() => setMembershipRole(leaveChapterMembership(make(), "d"), "lead")).toThrow(
      /cannot move/,
    );
    expect(() => leaveChapterMembership(leaveChapterMembership(make(), "d"), "d")).toThrow(
      /cannot move/,
    );
    expect(() => reactivateMembership(make(), "d")).toThrow(/cannot move/); // active, not left
  });
});
