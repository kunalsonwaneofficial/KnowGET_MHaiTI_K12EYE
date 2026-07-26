import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  activateMentorship,
  completeMentorship,
  endMentorship,
  isMentorshipActive,
  proposeMentorship,
} from "./mentorship-connection";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const mentorProfileId = "33333333-3333-3333-3333-333333333333" as Uuid;
const menteeProfileId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  proposeMentorship({
    tenantId,
    organizationId,
    mentorProfileId,
    menteeProfileId,
    proposedOn: "2026-01-05",
  });

describe("MentorshipConnection", () => {
  it("runs proposed → active → completed", () => {
    let m = make();
    expect(m.status).toBe("proposed");
    m = activateMentorship(m, "2026-01-10");
    expect(isMentorshipActive(m)).toBe(true);
    expect(m.startedOn).toBe("2026-01-10");
    m = completeMentorship(m, "2026-06-10");
    expect(m.status).toBe("completed");
    expect(m.endedOn).toBe("2026-06-10");
  });

  it("rejects a self-mentorship and guards transitions", () => {
    expect(() =>
      proposeMentorship({
        tenantId,
        organizationId,
        mentorProfileId,
        menteeProfileId: mentorProfileId,
        proposedOn: "d",
      }),
    ).toThrow(/cannot mentor themselves/);
    expect(() => activateMentorship(activateMentorship(make(), "d"), "d")).toThrow(/cannot move/);
    const ended = endMentorship(make(), "2026-02-01");
    expect(ended.status).toBe("ended");
    expect(() => completeMentorship(ended, "d")).toThrow(/cannot move/);
  });
});
