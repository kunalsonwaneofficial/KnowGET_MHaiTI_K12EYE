import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  markAppointmentNoShow,
  requestAppointment,
  rescheduleAppointment,
  scheduleAppointment,
} from "./appointment";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const centreId = "33333333-3333-3333-3333-333333333333" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  requestAppointment({ tenantId, organizationId, centreId, patientId, scheduledFor: "2026-02-01" });

describe("Appointment aggregate", () => {
  it("requests, schedules (assigning a clinician), checks in and completes", () => {
    const a = make();
    expect(a.status).toBe("requested");
    const s = scheduleAppointment(a, "c1" as Uuid);
    expect(s.status).toBe("scheduled");
    expect(s.clinicianId).toBe("c1");
    const ci = checkInAppointment(s);
    expect(ci.status).toBe("checked_in");
    expect(completeAppointment(ci).status).toBe("completed");
  });

  it("reschedules while open and keeps the clinician on schedule when none is passed", () => {
    const a = scheduleAppointment(make());
    expect(a.clinicianId).toBeNull();
    expect(rescheduleAppointment(a, "2026-02-05").scheduledFor).toBe("2026-02-05");
  });

  it("cancels from any open state and marks no-show only from scheduled", () => {
    expect(cancelAppointment(make()).status).toBe("cancelled");
    const s = scheduleAppointment(make());
    expect(markAppointmentNoShow(s).status).toBe("no_show");
    expect(cancelAppointment(checkInAppointment(s)).status).toBe("cancelled");
  });

  it("guards illegal transitions", () => {
    const a = make();
    expect(() => checkInAppointment(a)).toThrow(/cannot move/); // requested, not scheduled
    expect(() => completeAppointment(scheduleAppointment(a))).toThrow(/cannot move/); // scheduled, not checked_in
    expect(() => markAppointmentNoShow(a)).toThrow(/cannot move/); // requested, not scheduled
    const done = completeAppointment(checkInAppointment(scheduleAppointment(a)));
    expect(() => cancelAppointment(done)).toThrow(/cannot move/); // terminal
    expect(() => rescheduleAppointment(done, "2026-03-01")).toThrow(/cannot move/);
  });
});
