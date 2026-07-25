import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AcademicCalendarService } from "./academic-calendar-service";
import {
  AcademicCalendarNotFoundError,
  DuplicateAcademicCalendarError,
  OrganizationNotFoundForAcademicError,
} from "./errors";
import { InMemoryAcademicCalendarRepository, type OrganizationDirectory } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function service(): { svc: AcademicCalendarService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const svc = new AcademicCalendarService({
    repository: new InMemoryAcademicCalendarRepository(),
    organizations,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const create = (svc: AcademicCalendarService, academicYear = "2026-2027") =>
  svc.create({
    tenantId: TENANT,
    organizationId: ORG,
    academicYear,
    startDate: "2026-06-01",
    endDate: "2027-04-30",
  });

describe("AcademicCalendarService", () => {
  it("creates a calendar against a validated organization and publishes academic.year.created", async () => {
    const { svc, events } = service();
    const c = await create(svc);
    expect(c.status).toBe("draft");
    expect(events.map((e) => e.type)).toEqual(["academic.year.created"]);
    expect(await svc.getByYear(TENANT, ORG, "2026-2027")).toEqual(c);
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown organization and a duplicate year", async () => {
    const { svc } = service();
    await expect(
      svc.create({
        tenantId: TENANT,
        organizationId: UNKNOWN,
        academicYear: "2026-2027",
        startDate: "2026-06-01",
        endDate: "2027-04-30",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForAcademicError);
    await create(svc);
    await expect(create(svc)).rejects.toBeInstanceOf(DuplicateAcademicCalendarError);
    // a different year is fine
    expect(await create(svc, "2027-2028")).toBeDefined();
  });

  it("manages calendar structure and publishes academic.calendar.published", async () => {
    const { svc, events } = service();
    const c = await create(svc);
    await svc.addTerm(TENANT, c.id, {
      name: "Term 1",
      type: "term",
      startDate: "2026-06-01",
      endDate: "2026-09-30",
      sequence: 1,
    });
    const { holiday } = await svc.addHoliday(TENANT, c.id, {
      name: "Diwali",
      startDate: "2026-11-01",
      endDate: "2026-11-05",
      kind: "public",
    });
    await svc.setWorkingDays(TENANT, c.id, [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ]);
    const cleared = await svc.removeHoliday(TENANT, c.id, holiday.id);
    expect(cleared.holidays).toEqual([]);
    const published = await svc.publish(TENANT, c.id);
    expect(published.status).toBe("published");
    expect(published.terms).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("academic.calendar.published");
  });

  it("isolates tenants and reports a missing calendar", async () => {
    const { svc } = service();
    const c = await create(svc);
    const other = "44444444-4444-4444-4444-444444444444" as TenantId;
    await expect(svc.getById(other, c.id)).rejects.toBeInstanceOf(AcademicCalendarNotFoundError);
    await expect(svc.getById(TENANT, UNKNOWN)).rejects.toBeInstanceOf(
      AcademicCalendarNotFoundError,
    );
  });
});
