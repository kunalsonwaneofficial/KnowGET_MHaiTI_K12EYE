import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AdmissionService } from "./sick-bay-admission-service";
import { AppointmentService } from "./appointment-service";
import { CentreProfileService } from "./centre-profile-service";
import { ClinicianService } from "./clinician-service";
import { EncounterService } from "./clinical-encounter-service";
import { HealthCentreService } from "./health-centre-service";
import {
  type EmployeeDirectory,
  InMemoryAdmissionRepository,
  InMemoryAppointmentRepository,
  InMemoryCentreProfileRepository,
  InMemoryClinicianRepository,
  InMemoryEncounterRepository,
  InMemoryHealthCentreRepository,
  InMemoryPrescriptionRepository,
  InMemoryReferralRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";
import { PrescriptionService } from "./prescription-service";
import { ReferralService } from "./referral-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const employeeId = "aa000000-0000-0000-0000-000000000001" as Uuid;
const patientId = "bb000000-0000-0000-0000-000000000002" as Uuid;

const orgDir: OrganizationDirectory = {
  async exists() {
    return true;
  },
};
const personDir: PersonDirectory = {
  async exists() {
    return true;
  },
};
const employeeDir: EmployeeDirectory = {
  async exists() {
    return true;
  },
  async organizationOf() {
    return organizationId;
  },
};

describe("health-centre end-to-end spine", () => {
  it("runs clinician → centre → appointment → encounter → prescription → admission → referral → profile", async () => {
    const events: DomainEvent[] = [];
    const bus = {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    };

    const centreRepo = new InMemoryHealthCentreRepository();
    const clinicianRepo = new InMemoryClinicianRepository();
    const apptRepo = new InMemoryAppointmentRepository();
    const encRepo = new InMemoryEncounterRepository();
    const rxRepo = new InMemoryPrescriptionRepository();
    const admRepo = new InMemoryAdmissionRepository();
    const refRepo = new InMemoryReferralRepository();
    const profileRepo = new InMemoryCentreProfileRepository();

    const clinicians = new ClinicianService({
      repository: clinicianRepo,
      employees: employeeDir,
      events: bus,
    });
    const centres = new HealthCentreService({
      repository: centreRepo,
      organizations: orgDir,
      clinicians: clinicianRepo,
      events: bus,
    });
    const appointments = new AppointmentService({
      repository: apptRepo,
      centres: centreRepo,
      persons: personDir,
      clinicians: clinicianRepo,
      events: bus,
    });
    const encounters = new EncounterService({
      repository: encRepo,
      centres: centreRepo,
      persons: personDir,
      clinicians: clinicianRepo,
      events: bus,
    });
    const prescriptions = new PrescriptionService({
      repository: rxRepo,
      centres: centreRepo,
      persons: personDir,
      clinicians: clinicianRepo,
      events: bus,
    });
    const admissions = new AdmissionService({
      repository: admRepo,
      centres: centreRepo,
      persons: personDir,
      events: bus,
    });
    const referrals = new ReferralService({
      repository: refRepo,
      centres: centreRepo,
      persons: personDir,
      clinicians: clinicianRepo,
      events: bus,
    });
    const profiles = new CentreProfileService({
      repository: profileRepo,
      centres: centreRepo,
      admissions: admRepo,
      appointments: apptRepo,
      encounters: encRepo,
      prescriptions: rxRepo,
      referrals: refRepo,
      events: bus,
    });

    // 1. A clinician (validated Employee) and a centre with a sick bay; assign the lead.
    const clinician = await clinicians.register({ tenantId, employeeId, role: "physician" });
    const centre = await centres.create({
      tenantId,
      organizationId,
      code: "HC-1",
      name: "Main Infirmary",
      type: "infirmary",
      sickBayCapacity: 4,
    });
    await centres.assignLead(tenantId, centre.id, clinician.id);

    // 2. An appointment: request → schedule → check in → complete.
    const appt = await appointments.request({
      tenantId,
      centreId: centre.id,
      patientId,
      scheduledFor: "2026-01-01",
    });
    await appointments.schedule(tenantId, appt.id, clinician.id);
    await appointments.checkIn(tenantId, appt.id);
    await appointments.complete(tenantId, appt.id);

    // 3. An encounter: open → assign clinician → start → assess → complete.
    const encounter = await encounters.open({
      tenantId,
      centreId: centre.id,
      patientId,
      triageAcuity: "urgent",
      chiefComplaint: "headache",
    });
    await encounters.assignClinician(tenantId, encounter.id, clinician.id);
    await encounters.start(tenantId, encounter.id);
    await encounters.recordAssessment(tenantId, encounter.id, "migraine");
    await encounters.complete(tenantId, encounter.id, "discharged");

    // 4. A prescription with one dose recorded.
    const rx = await prescriptions.issue({
      tenantId,
      centreId: centre.id,
      patientId,
      clinicianId: clinician.id,
      medication: "Ibuprofen",
      frequencyPerDay: 3,
      durationDays: 5,
      startDate: "2026-01-01",
    });
    await prescriptions.recordDose(tenantId, rx.id, 1);

    // 5. A sick-bay admission (still active).
    await admissions.admit({
      tenantId,
      centreId: centre.id,
      patientId,
      bedLabel: "B-1",
      admittedOn: "2026-01-01",
    });

    // 6. A referral, accepted (still open).
    const referral = await referrals.raise({
      tenantId,
      centreId: centre.id,
      patientId,
      referredTo: "City Hospital",
      urgency: "urgent",
      raisedOn: "2026-01-02",
    });
    await referrals.accept(tenantId, referral.id);

    // 7. The profile reconciles the derived occupancy and the clinical workload.
    const profile = await profiles.refresh(tenantId, centre.id, "2026-01-04");
    expect(profile.activeAdmissionCount).toBe(1);
    expect(profile.occupancyPercent).toBe(25); // 1 of 4 beds
    expect(profile.bedsAvailable).toBe(3);
    expect(profile.openAppointmentCount).toBe(0); // completed
    expect(profile.openEncounterCount).toBe(0); // completed
    expect(profile.activePrescriptionCount).toBe(1);
    expect(profile.overduePrescriptionCount).toBe(1); // 12 due by 01-04, 1 given
    expect(profile.openReferralCount).toBe(1); // accepted is open

    // 8. The whole spine published its (content-free) domain events.
    const types = new Set(events.map((e) => e.type));
    for (const type of [
      "clinical.clinician.registered",
      "clinical.centre.registered",
      "clinical.centre.lead_assigned",
      "clinical.appointment.requested",
      "clinical.appointment.completed",
      "clinical.encounter.opened",
      "clinical.encounter.completed",
      "clinical.prescription.issued",
      "clinical.admission.opened",
      "clinical.referral.raised",
      "clinical.centre_profile.refreshed",
    ]) {
      expect(types.has(type)).toBe(true);
    }
    // No clinical free-text ever left the domain on an event.
    expect(JSON.stringify(events)).not.toContain("headache");
    expect(JSON.stringify(events)).not.toContain("migraine");
    expect(JSON.stringify(events)).not.toContain("Ibuprofen");
    expect(JSON.stringify(events)).not.toContain("City Hospital");
  });
});
