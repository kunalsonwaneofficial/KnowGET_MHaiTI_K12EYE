import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { CommunicationChannel } from "./communication-channel";
import type { CommunicationSchedule } from "./communication-schedule";
import {
  EmptyNotificationCategoryError,
  EmptyScheduleLabelError,
  ScheduleNotFoundError,
} from "./errors";
import type { NotificationLevel, NotificationPreference } from "./notification-preference";

/**
 * A family's communication profile — its preferred language and channels (in order),
 * the windows during which it prefers contact, per-category notification levels, and
 * any accessibility requirements. One per family. Richer than the Family aggregate's
 * quick preferred-communication defaults; this is the authoritative preference model
 * downstream messaging domains consume.
 */
export interface CommunicationProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly familyId: Uuid;
  readonly preferredLanguage: string | null;
  readonly preferredChannels: readonly CommunicationChannel[];
  readonly schedules: readonly CommunicationSchedule[];
  readonly notificationPreferences: readonly NotificationPreference[];
  readonly accessibilityRequirements: readonly string[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateCommunicationProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly familyId: Uuid;
  readonly preferredLanguage?: string | null;
  readonly preferredChannels?: readonly CommunicationChannel[];
}

/** Deduplicate a channel list, preserving first-seen order. */
const dedupeChannels = (
  channels: readonly CommunicationChannel[],
): readonly CommunicationChannel[] => [...new Set(channels)];

/** Create a new communication profile for a family. */
export function createCommunicationProfile(
  params: CreateCommunicationProfileParams,
): CommunicationProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    familyId: params.familyId,
    preferredLanguage: params.preferredLanguage?.trim() || null,
    preferredChannels: dedupeChannels(params.preferredChannels ?? []),
    schedules: [],
    notificationPreferences: [],
    accessibilityRequirements: [],
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  profile: CommunicationProfile,
  patch: Partial<CommunicationProfile>,
): CommunicationProfile => ({ ...profile, ...patch, updatedAt: nowIso() });

/** Set the preferred language. */
export function setPreferredLanguage(
  profile: CommunicationProfile,
  language: string | null,
): CommunicationProfile {
  return touch(profile, { preferredLanguage: language?.trim() || null });
}

/** Set the ordered list of preferred channels (deduplicated). */
export function setPreferredChannels(
  profile: CommunicationProfile,
  channels: readonly CommunicationChannel[],
): CommunicationProfile {
  return touch(profile, { preferredChannels: dedupeChannels(channels) });
}

/** Add or replace a schedule by label. */
export function putSchedule(
  profile: CommunicationProfile,
  schedule: CommunicationSchedule,
): CommunicationProfile {
  const label = schedule.label.trim();
  if (label.length === 0) {
    throw new EmptyScheduleLabelError();
  }
  const normalized: CommunicationSchedule = {
    label,
    days: schedule.days,
    fromTime: schedule.fromTime.trim(),
    toTime: schedule.toTime.trim(),
  };
  const others = profile.schedules.filter((s) => s.label !== label);
  return touch(profile, { schedules: [...others, normalized] });
}

/** Remove a schedule by label. */
export function removeSchedule(profile: CommunicationProfile, label: string): CommunicationProfile {
  const target = label.trim();
  if (!profile.schedules.some((s) => s.label === target)) {
    throw new ScheduleNotFoundError(target);
  }
  return touch(profile, { schedules: profile.schedules.filter((s) => s.label !== target) });
}

/** Set (add or replace) the notification level for a category. */
export function setNotificationPreference(
  profile: CommunicationProfile,
  category: string,
  level: NotificationLevel,
): CommunicationProfile {
  const trimmed = category.trim();
  if (trimmed.length === 0) {
    throw new EmptyNotificationCategoryError();
  }
  const others = profile.notificationPreferences.filter((p) => p.category !== trimmed);
  return touch(profile, {
    notificationPreferences: [...others, { category: trimmed, level }],
  });
}

/** Clear a category's notification preference (idempotent). */
export function clearNotificationPreference(
  profile: CommunicationProfile,
  category: string,
): CommunicationProfile {
  const trimmed = category.trim();
  return touch(profile, {
    notificationPreferences: profile.notificationPreferences.filter((p) => p.category !== trimmed),
  });
}

/** Set the accessibility requirements (trimmed, non-empty, deduplicated). */
export function setAccessibilityRequirements(
  profile: CommunicationProfile,
  requirements: readonly string[],
): CommunicationProfile {
  const cleaned = [...new Set(requirements.map((r) => r.trim()).filter((r) => r.length > 0))];
  return touch(profile, { accessibilityRequirements: cleaned });
}
