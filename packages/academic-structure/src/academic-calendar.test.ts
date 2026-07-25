import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  addExaminationPeriod,
  addHoliday,
  addSpecialEvent,
  addTerm,
  archiveCalendar,
  createAcademicCalendar,
  publishCalendar,
  removeHoliday,
  removeTerm,
  setWorkingDays,
} from "./academic-calendar";
import {
  CalendarNotDraftError,
  EmptyCalendarEntryError,
  InvalidDateRangeError,
  TermNotFoundError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const calendar = () =>
  createAcademicCalendar({
    tenantId: TENANT,
    organizationId: ORG,
    academicYear: "2026-2027",
    startDate: "2026-06-01",
    endDate: "2027-04-30",
  });

describe("academic calendar aggregate", () => {
  it("creates a draft calendar with the default working week", () => {
    const c = calendar();
    expect(c.organizationId).toBe(ORG);
    expect(c.academicYear).toBe("2026-2027");
    expect(c.status).toBe("draft");
    expect(c.publishedAt).toBeNull();
    expect(c.workingDays).toEqual(["monday", "tuesday", "wednesday", "thursday", "friday"]);
    expect(c.terms).toEqual([]);
  });

  it("rejects a blank academic year and an inverted date range", () => {
    expect(() => createAcademicCalendar({ ...calendar(), academicYear: " " })).toThrow(
      EmptyCalendarEntryError,
    );
    expect(() =>
      createAcademicCalendar({
        tenantId: TENANT,
        organizationId: ORG,
        academicYear: "2026-2027",
        startDate: "2027-04-30",
        endDate: "2026-06-01",
      }),
    ).toThrow(InvalidDateRangeError);
  });

  it("adds and removes terms, holidays, exam periods and events", () => {
    const { calendar: c0, term } = addTerm(calendar(), {
      name: "Term 1",
      type: "term",
      startDate: "2026-06-01",
      endDate: "2026-09-30",
      sequence: 1,
    });
    expect(c0.terms).toHaveLength(1);
    const { calendar: c1, holiday } = addHoliday(c0, {
      name: "Diwali",
      startDate: "2026-11-01",
      endDate: "2026-11-05",
      kind: "public",
    });
    const { calendar: c2 } = addExaminationPeriod(c1, {
      name: "Mid-terms",
      startDate: "2026-09-15",
      endDate: "2026-09-25",
    });
    const { calendar: c3, event } = addSpecialEvent(c2, {
      name: "Sports Day",
      date: "2026-12-10",
      category: "sports",
    });
    expect(c3.holidays).toHaveLength(1);
    expect(c3.examinationPeriods).toHaveLength(1);
    expect(event.name).toBe("Sports Day");
    const removed = removeHoliday(removeTerm(c3, term.id), holiday.id);
    expect(removed.terms).toEqual([]);
    expect(removed.holidays).toEqual([]);
    expect(() => removeTerm(calendar(), term.id)).toThrow(TermNotFoundError);
  });

  it("sets working days (deduplicated) and publishes once", () => {
    const withDays = setWorkingDays(calendar(), [
      "monday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
    expect(withDays.workingDays).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
    const published = publishCalendar(withDays);
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();
    expect(() => publishCalendar(published)).toThrow(CalendarNotDraftError);
    expect(() => publishCalendar(archiveCalendar(calendar()))).toThrow(CalendarNotDraftError);
  });
});
