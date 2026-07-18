import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyCalendarEntryTitleError, InvalidCalendarEntryTransitionError } from "./errors";
import {
  cancelEntry,
  completeEntry,
  isOverdue,
  rescheduleEntry,
  scheduleEntry,
} from "./governance-calendar";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001" as Uuid;

const meeting = () =>
  scheduleEntry({
    tenantId: TENANT,
    organizationId: ORG,
    type: "meeting",
    title: "Q3 Board Meeting",
    scheduledOn: "2026-09-15",
  });

describe("GovernanceCalendarEntry", () => {
  it("schedules an entry and rejects an empty title", () => {
    expect(meeting().status).toBe("scheduled");
    expect(() =>
      scheduleEntry({
        tenantId: TENANT,
        organizationId: ORG,
        type: "review",
        title: "  ",
        scheduledOn: "2026-01-01",
      }),
    ).toThrow(EmptyCalendarEntryTitleError);
  });

  it("reschedules a scheduled entry", () => {
    expect(rescheduleEntry(meeting(), "2026-09-22").scheduledOn).toBe("2026-09-22");
  });

  it("completes a meeting with minutes and attendance", () => {
    const completed = completeEntry(meeting(), {
      completedOn: "2026-09-15",
      minutes: "  Approved the budget.  ",
      attendeeIds: [ALICE],
    });
    expect(completed.status).toBe("completed");
    expect(completed.minutes).toBe("Approved the budget.");
    expect(completed.attendeeIds).toEqual([ALICE]);
  });

  it("cancels a scheduled entry and blocks transitions from a terminal state", () => {
    const cancelled = cancelEntry(meeting());
    expect(cancelled.status).toBe("cancelled");
    expect(() => completeEntry(cancelled)).toThrow(InvalidCalendarEntryTransitionError);
    expect(() => rescheduleEntry(cancelled, "2026-10-01")).toThrow(
      InvalidCalendarEntryTransitionError,
    );
  });

  it("computes overdue relative to a date", () => {
    const entry = meeting();
    expect(isOverdue(entry, "2026-09-14")).toBe(false);
    expect(isOverdue(entry, "2026-09-16")).toBe(true);
    expect(isOverdue(cancelEntry(entry), "2026-09-16")).toBe(false);
  });
});
