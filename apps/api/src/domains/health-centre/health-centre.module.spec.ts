import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AppointmentController } from "./appointment.controller";
import { CentreProfileController } from "./centre-profile.controller";
import { ClinicalEncounterController } from "./clinical-encounter.controller";
import { ClinicianController } from "./clinician.controller";
import { HealthCentreController } from "./health-centre.controller";
import { HealthCentreModule } from "./health-centre.module";
import {
  HC_ADMISSION_SERVICE,
  HC_APPOINTMENT_SERVICE,
  HC_CENTRE_SERVICE,
  HC_CLINICIAN_SERVICE,
  HC_ENCOUNTER_SERVICE,
  HC_PRESCRIPTION_SERVICE,
  HC_PROFILE_SERVICE,
  HC_REFERRAL_SERVICE,
} from "./health-centre.tokens";
import { PrescriptionController } from "./prescription.controller";
import { ReferralController } from "./referral.controller";
import { SickBayAdmissionController } from "./sick-bay-admission.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so
 * the health-centre DI graph — including the imported Organization, Person and Workforce modules —
 * compiles without a live database. The Prisma adapters only store the handle at construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("HealthCentreModule (integration)", () => {
  it("compiles the full health-centre DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, HealthCentreModule],
    }).compile();

    expect(moduleRef.get(HealthCentreController)).toBeInstanceOf(HealthCentreController);
    expect(moduleRef.get(ClinicianController)).toBeInstanceOf(ClinicianController);
    expect(moduleRef.get(CentreProfileController)).toBeInstanceOf(CentreProfileController);
    expect(moduleRef.get(AppointmentController)).toBeInstanceOf(AppointmentController);
    expect(moduleRef.get(ClinicalEncounterController)).toBeInstanceOf(ClinicalEncounterController);
    expect(moduleRef.get(PrescriptionController)).toBeInstanceOf(PrescriptionController);
    expect(moduleRef.get(SickBayAdmissionController)).toBeInstanceOf(SickBayAdmissionController);
    expect(moduleRef.get(ReferralController)).toBeInstanceOf(ReferralController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, HealthCentreModule],
    }).compile();

    for (const token of [
      HC_CENTRE_SERVICE,
      HC_CLINICIAN_SERVICE,
      HC_APPOINTMENT_SERVICE,
      HC_ENCOUNTER_SERVICE,
      HC_PRESCRIPTION_SERVICE,
      HC_ADMISSION_SERVICE,
      HC_REFERRAL_SERVICE,
      HC_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
