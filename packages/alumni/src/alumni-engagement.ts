import type { EngagementLevel } from "./alumni-value";
import type {
  AlumniActivityView,
  AlumniEngagement,
  EngagementLevelCount,
  EngagementSummary,
} from "./alumni-view";

/**
 * The weights the engagement engine gives each activity signal. Mentoring is the strongest signal of an
 * engaged alumnus, then chapter membership and giving, then event attendance. The weighted sum is capped at
 * 100, so a highly active alumnus saturates at a full score.
 */
const WEIGHT_EVENT_ATTENDED = 10;
const WEIGHT_ACTIVE_CHAPTER = 15;
const WEIGHT_ACTIVE_MENTORSHIP = 20;
const WEIGHT_CONTRIBUTION = 15;

const nonNeg = (value: number): number => Math.max(0, Math.floor(value));

/** The engagement level a score falls in — 0 inactive, 1–39 casual, 40–69 engaged, 70–100 champion. */
function levelOf(score: number): EngagementLevel {
  if (score <= 0) return "inactive";
  if (score < 40) return "casual";
  if (score < 70) return "engaged";
  return "champion";
}

/**
 * The pure engagement engine — values an alumnus's engagement from their activity: a weighted, capped 0–100
 * score (attendance + active chapters + active mentorships + contributions) and the level it falls in. Pure,
 * deterministic and clock-free — the score is a **count-derived index**, never money. Built and tested before
 * any aggregate depends on it.
 */
export function computeAlumniEngagement(activity: AlumniActivityView): AlumniEngagement {
  const raw =
    nonNeg(activity.eventsAttended) * WEIGHT_EVENT_ATTENDED +
    nonNeg(activity.activeChapters) * WEIGHT_ACTIVE_CHAPTER +
    nonNeg(activity.activeMentorships) * WEIGHT_ACTIVE_MENTORSHIP +
    nonNeg(activity.contributionsCount) * WEIGHT_CONTRIBUTION;
  const score = Math.min(100, raw);
  return { score, level: levelOf(score) };
}

/**
 * The pure engagement-rollup engine — summarizes a set of alumni engagements into a segment picture: the
 * count, the average score (rounded, empty-safe) and the per-level distribution. Pure and deterministic.
 */
export function summarizeAlumniEngagement(
  engagements: readonly AlumniEngagement[],
): EngagementSummary {
  const counts = new Map<EngagementLevel, number>();
  let total = 0;
  for (const engagement of engagements) {
    total += engagement.score;
    counts.set(engagement.level, (counts.get(engagement.level) ?? 0) + 1);
  }
  const levels: EngagementLevelCount[] = [...counts.entries()].map(([level, count]) => ({
    level,
    count,
  }));
  return {
    alumniCount: engagements.length,
    averageScore: engagements.length > 0 ? Math.round(total / engagements.length) : 0,
    levels,
  };
}
