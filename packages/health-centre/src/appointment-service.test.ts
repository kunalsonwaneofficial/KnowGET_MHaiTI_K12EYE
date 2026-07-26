import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AppointmentService } from "./appointment-service";
import { registerClinician, suspendClinician } from "./clinician";
import { decommissionCentre, registerHealthCentre } from "./health-centre";
import {
  InMemoryAppointmentRepository,
  InMemoryClinicianRepository,
  InMemoryHealthCentreRepository,
  type PersonDirectory,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;

const personDir = (known = true): PersonDirectory => ({
  async exists() {
    return known;
  },
});

const setup = async (patientKnown = true) => {
  const repository = new InMemoryAppointmentRepository();
  const centres = new InMemoryHealthCentreRepository();
  const clinicians = new InMemoryClinicianRepository();
  const events: DomainEvent[] = [];
  const centre = registerHealthCentre({
    tenantId,
    organizationId,
    code: "HC-1",
    name: "Infirmary",
    type: "infirmary",
  });
  await centres.save(centre);
  const service = new AppointmentService({
    repository,
    centres,
    persons: personDir(patientKnown),
    clinicians,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, centres, clinicians, service, centre, events };
};

describe("AppointmentService", () => {
  it("requests, schedules, checks in and completes, deriving the org and emitting", async () => {
    const { service, centre, events } = await setup();
    const a = await service.request({
      tenantId,
      centreId: centre.id,
      patientId,
      scheduledFor: "2026-02-01",
    });
    expect(a.organizationId).toBe(organizationId);
    await service.schedule(tenantId, a.id);
    await service.checkIn(tenantId, a.id);
    const done = await service.complete(tenantId, a.id);
    expect(done.status).toBe("completed");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("clinical.appointment.requested")).toBe(true);
    expect(types.has("clinical.appointment.completed")).toBe(true);
  });

  it("emits a distinct rescheduled event (not scheduled) for a still-requested appointment", async () => {
    const { service, centre, events } = await setup();
    const a = await service.request({
      tenantId,
      centreId: centre.id,
      patientId,
      scheduledFor: "2026-02-01",
    });
    const moved = await service.reschedule(tenantId, a.id, "2026-02-05");
    expect(moved.status).toBe("requested"); // reschedule does not confirm the slot
    expect(moved.scheduledFor).toBe("2026-02-05");
    const types = events.map((e) => e.type);
    expect(types).toContain("clinical.appointment.rescheduled");
    expect(types).not.toContain("clinical.appointment.scheduled"); // never confirmed
  });

  it("rejects an unknown centre and an unknown patient", async () => {
    const { service, centre } = await setup(false);
    await expect(
      service.request({ tenantId, centreId: "missing" as Uuid, patientId, scheduledFor: "d" }),
    ).rejects.toThrow(/Health centre/);
    await expect(
      service.request({ tenantId, centreId: centre.id, patientId, scheduledFor: "d" }),
    ).rejects.toThrow(/Person/); // patient unknown
  });

  it("rejects requesting against a decommissioned centre", async () => {
    const { service, centres, centre } = await setup();
    await centres.save(decommissionCentre(centre));
    await expect(
      service.request({ tenantId, centreId: centre.id, patientId, scheduledFor: "2026-02-01" }),
    ).rejects.toThrow(/not active/);
  });

  it("validates a named clinician is active when requesting", async () => {
    const { service, clinicians, centre } = await setup();
    const suspended = suspendClinician(
      registerClinician({ tenantId, organizationId, employeeId: "e1" as Uuid, role: "nurse" }),
    );
    await clinicians.save(suspended);
    await expect(
      service.request({
        tenantId,
        centreId: centre.id,
        patientId,
        scheduledFor: "2026-02-01",
        clinicianId: suspended.id,
      }),
    ).rejects.toThrow(/not active/);
  });
});
