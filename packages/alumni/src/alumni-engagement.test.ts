import { describe, expect, it } from "vitest";
import { computeAlumniEngagement, summarizeAlumniEngagement } from "./alumni-engagement";

describe("computeAlumniEngagement", () => {
  it("scores an inactive alumnus (no activity) at zero", () => {
    const e = computeAlumniEngagement({
      eventsAttended: 0,
      activeChapters: 0,
      activeMentorships: 0,
      contributionsCount: 0,
    });
    expect(e).toEqual({ score: 0, level: "inactive" });
  });

  it("weights the signals and reads the level bands", () => {
    expect(
      computeAlumniEngagement({
        eventsAttended: 1,
        activeChapters: 0,
        activeMentorships: 0,
        contributionsCount: 0,
      }),
    ).toEqual({ score: 10, level: "casual" });

    // 1*10 + 1*15 + 1*20 = 45 → engaged
    expect(
      computeAlumniEngagement({
        eventsAttended: 1,
        activeChapters: 1,
        activeMentorships: 1,
        contributionsCount: 0,
      }),
    ).toEqual({ score: 45, level: "engaged" });

    // 2*10 + 1*15 + 1*20 + 1*15 = 70 → champion
    expect(
      computeAlumniEngagement({
        eventsAttended: 2,
        activeChapters: 1,
        activeMentorships: 1,
        contributionsCount: 1,
      }),
    ).toEqual({ score: 70, level: "champion" });
  });

  it("caps the score at 100 and floors negative signals to zero", () => {
    expect(
      computeAlumniEngagement({
        eventsAttended: 20,
        activeChapters: 0,
        activeMentorships: 0,
        contributionsCount: 0,
      }),
    ).toEqual({ score: 100, level: "champion" });
    expect(
      computeAlumniEngagement({
        eventsAttended: -5,
        activeChapters: -2,
        activeMentorships: 0,
        contributionsCount: 0,
      }),
    ).toEqual({ score: 0, level: "inactive" });
  });
});

describe("summarizeAlumniEngagement", () => {
  it("is empty-safe", () => {
    expect(summarizeAlumniEngagement([])).toEqual({
      alumniCount: 0,
      averageScore: 0,
      levels: [],
    });
  });

  it("counts, averages and distributes across levels", () => {
    const summary = summarizeAlumniEngagement([
      { score: 0, level: "inactive" },
      { score: 10, level: "casual" },
      { score: 70, level: "champion" },
      { score: 100, level: "champion" },
    ]);
    expect(summary.alumniCount).toBe(4);
    expect(summary.averageScore).toBe(45); // (0+10+70+100)/4 = 45
    expect(summary.levels).toContainEqual({ level: "champion", count: 2 });
    expect(summary.levels).toContainEqual({ level: "casual", count: 1 });
    expect(summary.levels).toContainEqual({ level: "inactive", count: 1 });
  });
});
