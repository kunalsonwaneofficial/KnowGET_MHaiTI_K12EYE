import type {
  AccessActivitySummary,
  AccessActivityView,
  AccessEvaluation,
  CredentialAccessView,
  ZoneAccessView,
} from "./campus-security-view";

/**
 * The pure access engine — decides whether a credential may enter a zone, and why. The checks run in
 * priority order so the reason is the most fundamental blocker: an inactive (suspended/revoked) credential,
 * then an expired credential (its expiry strictly before the as-of date), then an unavailable
 * (decommissioned) zone, then a locked-down zone, then a zone the credential does not grant; otherwise
 * access is granted (`ok`). Pure, deterministic and clock-free (the as-of date is passed in). Built and
 * tested before any aggregate depends on it.
 */
export function evaluateAccess(
  credential: CredentialAccessView,
  zone: ZoneAccessView,
  asOfDate: string | null = null,
): AccessEvaluation {
  if (credential.status !== "active") {
    return { decision: "denied", reason: "credential_inactive" };
  }
  if (credential.expiresOn !== null && asOfDate !== null && credential.expiresOn < asOfDate) {
    return { decision: "denied", reason: "credential_expired" };
  }
  if (zone.status === "decommissioned") {
    return { decision: "denied", reason: "zone_unavailable" };
  }
  if (zone.status === "locked_down") {
    return { decision: "denied", reason: "zone_locked_down" };
  }
  if (!credential.grantedZoneIds.includes(zone.id)) {
    return { decision: "denied", reason: "zone_not_granted" };
  }
  return { decision: "granted", reason: "ok" };
}

/**
 * The pure access-activity engine — summarizes a set of access events into total, granted and denied counts.
 * Pure and deterministic.
 */
export function summarizeAccessActivity(
  events: readonly AccessActivityView[],
): AccessActivitySummary {
  let granted = 0;
  let denied = 0;
  for (const event of events) {
    if (event.decision === "granted") {
      granted += 1;
    } else if (event.decision === "denied") {
      denied += 1;
    }
  }
  return { total: events.length, granted, denied };
}
