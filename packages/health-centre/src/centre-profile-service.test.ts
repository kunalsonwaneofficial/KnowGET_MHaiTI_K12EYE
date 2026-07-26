import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { requestAppointment, scheduleAppointment } from "./appointment";
import { CentreProfileService } from "./centre-profile-service";
import { openEncounter } from "./clinical-encounter";
import { registerHealthCentre } from "./health-centre";
import {
  InMemoryAdmissionRepository,
  InMemoryAppointmentRepository,
  InMemoryCentreProfileRepository,
  InMemoryEncounterRepository,
  InMemoryHealthCentreRepository,
  InMemoryPrescriptionRepository,
  InMemoryReferralRepository,
} from "./ports";
import { issuePrescription } from "./prescription";
import { raiseReferral } from "./referral";
import { admitToSickBay } from "./sick-bay-admission";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const setup = async () => {
  const repository = new InMemoryCentreProfileRepository();
  const centres = new InMemoryHealthCentreRepository();
  const admissions = new InMemoryAdmissionRepository();
  const appointments = new InMemoryAppointmentRepository();
  const encounters = new InMemoryEncounterRepository();
  const prescriptions = new InMemoryPrescriptionRepository();
  const referrals = new InMemoryReferralRepository();

  const centre = registerHealthCentre({
    tenantId,
    organizationId,
    code: "HC-1",
    name: "Infirmary",
    type: "infirmary",
    sickBayCapacity: 4,
  });
  await centres.save(centre);
  const base = { tenantId, organizationId, centreId: centre.id };

  await admissions.save(
    admitToSickBay({ ...base, patientId: "p1" as Uuid, bedLabel: "B-1", admittedOn: "2026-01-01" }),
  );
  await admissions.save(
    admitToSickBay({ ...base, patientId: "p2" as Uuid, bedLabel: "B-2", admittedOn: "2026-01-01" }),
  );
  await appointments.save(
    scheduleAppointment(
      requestAppointment({ ...base, patientId: "p3" as Uuid, scheduledFor: "2026-01-05" }),
    ),
  );
  await encounters.save(
    openEncounter({ ...base, patientId: "p4" as Uuid, triageAcuity: "routine" }),
  );
  await prescriptions.save(
    issuePrescription({
      ...base,
      patientId: "p1" as Uuid,
      clinicianId: "c1" as Uuid,
      medication: "Amoxicillin",
      frequencyPerDay: 3,
      durationDays: 5,
      startDate: "2026-01-01",
    }),
  );
  await referrals.save(
    raiseReferral({
      ...base,
      patientId: "p2" as Uuid,
      referredTo: "City Hospital",
      urgency: "urgent",
      raisedOn: "2026-01-02",
    }),
  );

  const service = new CentreProfileService({
    repository,
    centres,
    admissions,
    appointments,
    encounters,
    prescriptions,
    referrals,
  });
  return { service, centre };
};

describe("CentreProfileService", () => {
  it("reconciles occupancy and clinical workload as of a date, via both engines", async () => {
    const { service, centre } = await setup();
    const p = await service.refresh(tenantId, centre.id, "2026-01-04"); // prescription overdue by now
    expect(p.sickBayCapacity).toBe(4);
    expect(p.activeAdmissionCount).toBe(2);
    expect(p.bedsAvailable).toBe(2);
    expect(p.occupancyPercent).toBe(50);
    expect(p.overCapacity).toBe(false);
    expect(p.openAppointmentCount).toBe(1);
    expect(p.openEncounterCount).toBe(1);
    expect(p.activePrescriptionCount).toBe(1);
    expect(p.overduePrescriptionCount).toBe(1); // 12 due by 01-04, 0 given
    expect(p.openReferralCount).toBe(1);
    expect(p.version).toBe(1);
  });

  it("version-bumps on a second refresh and shows no overdue before the course starts", async () => {
    const { service, centre } = await setup();
    await service.refresh(tenantId, centre.id, "2026-01-04");
    const p = await service.refresh(tenantId, centre.id, "2025-12-31"); // before any dosing is due
    expect(p.version).toBe(2);
    expect(p.overduePrescriptionCount).toBe(0);
  });

  it("summarizes the institution occupancy via the rollup engine", async () => {
    const { service } = await setup();
    const s = await service.summarize(tenantId);
    expect(s).toEqual({
      centreCount: 1,
      bedCapacity: 4,
      occupantCount: 2,
      bedsAvailable: 2,
      overCapacityCentreCount: 0,
    });
  });

  it("rejects refreshing an unknown centre", async () => {
    const { service } = await setup();
    await expect(service.refresh(tenantId, "missing" as Uuid, "2026-01-04")).rejects.toThrow(
      /Health centre/,
    );
  });
});
