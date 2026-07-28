import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_SCORE_WEIGHT,
  IMPACT_SCORE_WEIGHT,
  URGENCY_HORIZON_HOURS,
  URGENCY_SCORE_WEIGHT,
  hoursUntil,
  humanGatedRecommendations,
  isExpiredRecommendation,
  priorityScore,
  rankRecommendations,
  summarizeBacklog,
  topRecommendations,
} from "./prioritization";
import type { RecommendationPriorityView } from "./decision-view";

const NOW = "2026-03-01T00:00:00.000Z";
const IN_36_HOURS = "2026-03-02T12:00:00.000Z";
const IN_96_HOURS = "2026-03-05T00:00:00.000Z";
const A_DAY_AGO = "2026-02-28T00:00:00.000Z";

const rec = (
  patch: Partial<RecommendationPriorityView> & { id: string },
): RecommendationPriorityView => ({
  status: "proposed",
  impactBand: "individual",
  riskLevel: "low",
  confidence: 0,
  createdAt: "2026-02-01T00:00:00.000Z",
  expiresAt: null,
  ...patch,
});

describe("the weights are declared, not buried", () => {
  it("adds up to a scale a person can check", () => {
    expect(IMPACT_SCORE_WEIGHT * 3 + 100 * CONFIDENCE_SCORE_WEIGHT + URGENCY_SCORE_WEIGHT).toBe(
      150,
    );
  });

  it("scores the floor at nothing", () => {
    expect(priorityScore(rec({ id: "r1" }), NOW)).toBe(0);
  });

  it("scores the ceiling at the top of the scale", () => {
    expect(
      priorityScore(
        rec({ id: "r1", impactBand: "institution", confidence: 100, expiresAt: NOW }),
        NOW,
      ),
    ).toBe(150);
  });
});

describe("what the score is made of", () => {
  it("weighs reach by band", () => {
    const at = (impactBand: RecommendationPriorityView["impactBand"]): number =>
      priorityScore(rec({ id: "r1", impactBand }), NOW);
    expect([at("individual"), at("cohort"), at("department"), at("institution")]).toEqual([
      0, 25, 50, 75,
    ]);
  });

  it("weighs evidence confidence at half a point each", () => {
    expect(priorityScore(rec({ id: "r1", confidence: 90 }), NOW)).toBe(45);
  });

  it("clamps a confidence that came in out of range rather than letting it distort the queue", () => {
    expect(priorityScore(rec({ id: "r1", confidence: 400 }), NOW)).toBe(50);
    expect(priorityScore(rec({ id: "r1", confidence: -80 }), NOW)).toBe(0);
  });

  it("weighs a window that is closing, linearly across the horizon", () => {
    expect(priorityScore(rec({ id: "r1", expiresAt: IN_36_HOURS }), NOW)).toBe(12.5);
  });

  it("ignores a window further off than the horizon", () => {
    expect(priorityScore(rec({ id: "r1", expiresAt: IN_96_HOURS }), NOW)).toBe(0);
    expect(URGENCY_HORIZON_HOURS).toBe(72);
  });

  it("ignores a recommendation that never lapses", () => {
    expect(priorityScore(rec({ id: "r1", expiresAt: null }), NOW)).toBe(0);
  });

  it("adds its parts together and nothing else", () => {
    expect(
      priorityScore(
        rec({ id: "r1", impactBand: "cohort", confidence: 50, expiresAt: IN_36_HOURS }),
        NOW,
      ),
    ).toBe(62.5);
  });

  it("does not weigh risk — that is the gate's question, not the queue's", () => {
    const low = priorityScore(rec({ id: "r1", riskLevel: "low", confidence: 60 }), NOW);
    const critical = priorityScore(rec({ id: "r2", riskLevel: "critical", confidence: 60 }), NOW);
    expect(critical).toBe(low);
  });
});

describe("how long is left", () => {
  it("counts whole hours to the window closing", () => {
    expect(hoursUntil(IN_36_HOURS, NOW)).toBe(36);
  });

  it("counts backwards once the window has closed", () => {
    expect(hoursUntil(A_DAY_AGO, NOW)).toBe(-24);
  });

  it("has no answer for a recommendation that does not lapse", () => {
    expect(hoursUntil(null, NOW)).toBeNull();
  });

  it("has no answer rather than a guess when a moment is unreadable", () => {
    expect(hoursUntil(IN_36_HOURS, "not-a-date")).toBeNull();
    expect(hoursUntil("whenever", NOW)).toBeNull();
  });

  it("says whether the window has closed", () => {
    expect(isExpiredRecommendation(rec({ id: "r1", expiresAt: A_DAY_AGO }), NOW)).toBe(true);
    expect(isExpiredRecommendation(rec({ id: "r1", expiresAt: IN_36_HOURS }), NOW)).toBe(false);
    expect(isExpiredRecommendation(rec({ id: "r1", expiresAt: null }), NOW)).toBe(false);
  });

  it("treats a window closing exactly now as closed", () => {
    expect(isExpiredRecommendation(rec({ id: "r1", expiresAt: NOW }), NOW)).toBe(true);
  });
});

describe("the queue", () => {
  it("ranks only what is still waiting for an answer", () => {
    const ranked = rankRecommendations(
      [
        rec({ id: "open", impactBand: "cohort" }),
        rec({ id: "accepted", status: "accepted", impactBand: "institution" }),
        rec({ id: "rejected", status: "rejected", impactBand: "institution" }),
        rec({ id: "withdrawn", status: "withdrawn", impactBand: "institution" }),
      ],
      NOW,
    );
    expect(ranked.map((entry) => entry.id)).toEqual(["open"]);
  });

  it("puts the heaviest first", () => {
    const ranked = rankRecommendations(
      [
        rec({ id: "small", impactBand: "individual", confidence: 30 }),
        rec({ id: "wide", impactBand: "institution", confidence: 30 }),
        rec({ id: "middling", impactBand: "department", confidence: 30 }),
      ],
      NOW,
    );
    expect(ranked.map((entry) => entry.id)).toEqual(["wide", "middling", "small"]);
  });

  it("breaks a tie by id so the order never wobbles between refreshes", () => {
    const ranked = rankRecommendations([rec({ id: "b" }), rec({ id: "a" })], NOW);
    expect(ranked.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("puts a lapsed recommendation last however heavy it is", () => {
    const ranked = rankRecommendations(
      [
        rec({
          id: "lapsed",
          impactBand: "institution",
          confidence: 100,
          expiresAt: A_DAY_AGO,
        }),
        rec({ id: "live", impactBand: "individual", confidence: 10 }),
      ],
      NOW,
    );
    expect(ranked.map((entry) => entry.id)).toEqual(["live", "lapsed"]);
  });

  it("still lists the lapsed one — an administrator needs to see what went unanswered", () => {
    const ranked = rankRecommendations([rec({ id: "lapsed", expiresAt: A_DAY_AGO })], NOW);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.expired).toBe(true);
    expect(ranked[0]?.hoursRemaining).toBe(-24);
  });

  it("reports risk alongside the score rather than folding it in", () => {
    const ranked = rankRecommendations([rec({ id: "r1", riskLevel: "critical" })], NOW);
    expect(ranked[0]?.riskLevel).toBe("critical");
  });

  it("reports nothing rather than guessing when the moment is unreadable", () => {
    expect(rankRecommendations([rec({ id: "r1" })], "not-a-date")).toEqual([]);
  });

  it("takes the heaviest few for a dashboard with room for a few", () => {
    const many = [
      rec({ id: "a", impactBand: "institution" }),
      rec({ id: "b", impactBand: "department" }),
      rec({ id: "c", impactBand: "cohort" }),
    ];
    expect(topRecommendations(many, NOW, 2).map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(topRecommendations(many, NOW, 0)).toEqual([]);
    expect(topRecommendations(many, NOW, -1)).toEqual([]);
  });
});

describe("which recommendations can never be automated", () => {
  it("names the open ones whose risk exceeds the auto-execution ceiling", () => {
    const gated = humanGatedRecommendations([
      rec({ id: "low", riskLevel: "low" }),
      rec({ id: "medium", riskLevel: "medium" }),
      rec({ id: "critical", riskLevel: "critical" }),
    ]);
    expect(gated.map((entry) => entry.id)).toEqual(["medium", "critical"]);
  });

  it("says nothing about a recommendation that is no longer open", () => {
    expect(
      humanGatedRecommendations([rec({ id: "r1", riskLevel: "critical", status: "accepted" })]),
    ).toEqual([]);
  });
});

describe("the backlog", () => {
  const backlog = summarizeBacklog(
    [
      rec({ id: "a", impactBand: "institution", riskLevel: "critical" }),
      rec({ id: "b", impactBand: "cohort", riskLevel: "low" }),
      rec({ id: "c", impactBand: "cohort", riskLevel: "medium", expiresAt: A_DAY_AGO }),
      rec({ id: "d", status: "accepted", impactBand: "institution" }),
    ],
    NOW,
  );

  it("separates what is still answerable from what lapsed unanswered", () => {
    expect(backlog.openCount).toBe(2);
    expect(backlog.expiredCount).toBe(1);
  });

  it("spreads the live population across reach, keeping the bands that scored nothing", () => {
    expect(backlog.byImpact).toEqual([
      { key: "individual", count: 0 },
      { key: "cohort", count: 1 },
      { key: "department", count: 0 },
      { key: "institution", count: 1 },
    ]);
  });

  it("spreads the live population across risk, in the vocabulary's own order", () => {
    expect(backlog.byRisk).toEqual([
      { key: "low", count: 1 },
      { key: "medium", count: 0 },
      { key: "high", count: 0 },
      { key: "critical", count: 1 },
    ]);
  });

  it("counts what a person must decide either way", () => {
    expect(backlog.humanGatedCount).toBe(1);
  });

  it("carries the queue itself, lapsed included and last", () => {
    expect(backlog.ranked.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("is empty rather than invented when the moment is unreadable", () => {
    expect(summarizeBacklog([rec({ id: "a" })], "not-a-date")).toEqual({
      openCount: 0,
      expiredCount: 0,
      byImpact: [
        { key: "individual", count: 0 },
        { key: "cohort", count: 0 },
        { key: "department", count: 0 },
        { key: "institution", count: 0 },
      ],
      byRisk: [
        { key: "low", count: 0 },
        { key: "medium", count: 0 },
        { key: "high", count: 0 },
        { key: "critical", count: 0 },
      ],
      humanGatedCount: 0,
      ranked: [],
    });
  });

  it("gives the same picture for the same moment however often it is asked", () => {
    const population = [rec({ id: "a" }), rec({ id: "b", expiresAt: IN_36_HOURS })];
    expect(summarizeBacklog(population, NOW)).toEqual(summarizeBacklog(population, NOW));
  });
});
