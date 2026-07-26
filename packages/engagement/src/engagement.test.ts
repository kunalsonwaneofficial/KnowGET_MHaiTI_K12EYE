import { describe, expect, it } from "vitest";
import { computeAnnouncementReach, summarizeEngagement } from "./engagement";

describe("computeAnnouncementReach", () => {
  it("values acknowledged, pending and an acknowledgement percent", () => {
    const reach = computeAnnouncementReach(200, 50);
    expect(reach).toEqual({
      audienceSize: 200,
      acknowledgedCount: 50,
      pendingCount: 150,
      acknowledgementPercent: 25,
    });
  });

  it("reads 0% for an empty audience and never goes negative or over 100%", () => {
    expect(computeAnnouncementReach(0, 0)).toEqual({
      audienceSize: 0,
      acknowledgedCount: 0,
      pendingCount: 0,
      acknowledgementPercent: 0,
    });
    // more acknowledgements than the audience (a stale audience) is capped, not over 100 / negative pending
    const reach = computeAnnouncementReach(10, 15);
    expect(reach.pendingCount).toBe(0);
    expect(reach.acknowledgementPercent).toBe(100);
  });

  it("clamps negative inputs to zero", () => {
    expect(computeAnnouncementReach(-5, -3)).toEqual({
      audienceSize: 0,
      acknowledgedCount: 0,
      pendingCount: 0,
      acknowledgementPercent: 0,
    });
  });
});

describe("summarizeEngagement", () => {
  it("rolls up announcements into totals and an overall acknowledgement percent", () => {
    const summary = summarizeEngagement([
      { audienceSize: 100, acknowledgedCount: 40 },
      { audienceSize: 100, acknowledgedCount: 60 },
    ]);
    expect(summary).toEqual({
      announcementCount: 2,
      totalAudience: 200,
      totalAcknowledged: 100,
      acknowledgementPercent: 50,
    });
  });

  it("is empty-safe (no announcements ⇒ zero everything, 0%)", () => {
    expect(summarizeEngagement([])).toEqual({
      announcementCount: 0,
      totalAudience: 0,
      totalAcknowledged: 0,
      acknowledgementPercent: 0,
    });
  });
});
