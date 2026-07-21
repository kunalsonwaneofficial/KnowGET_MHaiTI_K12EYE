import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  clearNotificationPreference,
  createCommunicationProfile,
  putSchedule,
  removeSchedule,
  setAccessibilityRequirements,
  setNotificationPreference,
  setPreferredChannels,
  setPreferredLanguage,
} from "./communication-profile";
import {
  EmptyNotificationCategoryError,
  EmptyScheduleLabelError,
  ScheduleNotFoundError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const FAMILY = "33333333-3333-3333-3333-333333333333" as Uuid;

const base = () =>
  createCommunicationProfile({ tenantId: TENANT, organizationId: ORG, familyId: FAMILY });

describe("CommunicationProfile aggregate", () => {
  it("creates an empty profile with trimmed language and deduped channels", () => {
    const p = createCommunicationProfile({
      tenantId: TENANT,
      organizationId: ORG,
      familyId: FAMILY,
      preferredLanguage: " en ",
      preferredChannels: ["email", "sms", "email"],
    });
    expect(p.preferredLanguage).toBe("en");
    expect(p.preferredChannels).toEqual(["email", "sms"]);
    expect(p.schedules).toEqual([]);
    expect(p.notificationPreferences).toEqual([]);
  });

  it("sets language and channels", () => {
    let p = setPreferredLanguage(base(), " hi ");
    expect(p.preferredLanguage).toBe("hi");
    p = setPreferredChannels(p, ["phone", "phone", "app"]);
    expect(p.preferredChannels).toEqual(["phone", "app"]);
  });

  it("adds and removes schedules by label", () => {
    let p = putSchedule(base(), {
      label: "weekday-evenings",
      days: ["monday", "tuesday"],
      fromTime: "17:00",
      toTime: "20:00",
    });
    expect(p.schedules).toHaveLength(1);
    expect(() => putSchedule(p, { label: "  ", days: [], fromTime: "", toTime: "" })).toThrow(
      EmptyScheduleLabelError,
    );
    p = removeSchedule(p, "weekday-evenings");
    expect(p.schedules).toHaveLength(0);
    expect(() => removeSchedule(p, "missing")).toThrow(ScheduleNotFoundError);
  });

  it("sets and clears notification preferences by category", () => {
    let p = setNotificationPreference(base(), "attendance", "high");
    p = setNotificationPreference(p, "attendance", "muted"); // replaces
    expect(p.notificationPreferences).toEqual([{ category: "attendance", level: "muted" }]);
    expect(() => setNotificationPreference(p, "  ", "high")).toThrow(
      EmptyNotificationCategoryError,
    );
    p = clearNotificationPreference(p, "attendance");
    expect(p.notificationPreferences).toEqual([]);
    expect(clearNotificationPreference(p, "absent").notificationPreferences).toEqual([]);
  });

  it("sets accessibility requirements, trimming and deduplicating", () => {
    const p = setAccessibilityRequirements(base(), [
      " large_print ",
      "large_print",
      " ",
      "screen_reader",
    ]);
    expect(p.accessibilityRequirements).toEqual(["large_print", "screen_reader"]);
  });
});
