import type {
  AnnouncementReach,
  AnnouncementReachView,
  EngagementSummary,
} from "./engagement-view";

/**
 * The pure engagement engine — values an announcement's reach: its audience size against the number who have
 * acknowledged it, the still-pending count (never negative) and an acknowledgement percent (capped at 100; an
 * empty audience reads 0%). Pure, deterministic and clock-free. Built and tested before any aggregate depends
 * on it.
 */
export function computeAnnouncementReach(
  audienceSize: number,
  acknowledgedCount: number,
): AnnouncementReach {
  const acknowledged = Math.max(0, acknowledgedCount);
  const size = Math.max(0, audienceSize);
  return {
    audienceSize: size,
    acknowledgedCount: acknowledged,
    pendingCount: Math.max(0, size - acknowledged),
    acknowledgementPercent: size > 0 ? Math.round((Math.min(acknowledged, size) / size) * 100) : 0,
  };
}

/**
 * The pure engagement-rollup engine — summarizes a set of announcement reaches into a campaign picture: the
 * announcement count, the total audience reached, the total acknowledged, and the overall acknowledgement
 * percent (total acknowledged over total audience, capped at 100; an empty total audience reads 0%). Pure and
 * deterministic.
 */
export function summarizeEngagement(items: readonly AnnouncementReachView[]): EngagementSummary {
  let totalAudience = 0;
  let totalAcknowledged = 0;
  for (const item of items) {
    const size = Math.max(0, item.audienceSize);
    totalAudience += size;
    // Cap each item's acknowledged count at its own audience size (as computeAnnouncementReach does), so a
    // stale over-count on one announcement cannot push the rolled-up percent above 100.
    totalAcknowledged += Math.min(Math.max(0, item.acknowledgedCount), size);
  }
  return {
    announcementCount: items.length,
    totalAudience,
    totalAcknowledged,
    acknowledgementPercent:
      totalAudience > 0
        ? Math.round((Math.min(totalAcknowledged, totalAudience) / totalAudience) * 100)
        : 0,
  };
}
