import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  createAlumniEngagementProfile,
  refreshAlumniEngagementProfile,
} from "./alumni-engagement-profile";
import { computeAlumniEngagement } from "./alumni-engagement";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const alumniProfileId = "33333333-3333-3333-3333-333333333333" as Uuid;

describe("AlumniEngagementProfile", () => {
  it("creates empty (zeros, inactive)", () => {
    const p = createAlumniEngagementProfile({ tenantId, organizationId, alumniProfileId });
    expect(p.alumniProfileId).toBe(alumniProfileId);
    expect(p.score).toBe(0);
    expect(p.level).toBe("inactive");
    expect(p.eventsAttended).toBe(0);
  });

  it("folds the activity + engagement into the snapshot, preserving identity", () => {
    const p = createAlumniEngagementProfile({ tenantId, organizationId, alumniProfileId });
    const activity = {
      eventsAttended: 2,
      activeChapters: 1,
      activeMentorships: 1,
      contributionsCount: 1,
    };
    const refreshed = refreshAlumniEngagementProfile(p, {
      activity,
      engagement: computeAlumniEngagement(activity),
    });
    expect(refreshed.id).toBe(p.id);
    expect(refreshed.createdAt).toBe(p.createdAt);
    expect(refreshed.eventsAttended).toBe(2);
    expect(refreshed.activeChapters).toBe(1);
    expect(refreshed.activeMentorships).toBe(1);
    expect(refreshed.contributionsCount).toBe(1);
    expect(refreshed.score).toBe(70);
    expect(refreshed.level).toBe("champion");
  });
});
