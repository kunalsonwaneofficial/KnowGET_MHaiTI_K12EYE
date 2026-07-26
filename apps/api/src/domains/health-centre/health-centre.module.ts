import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  type AdmissionRepository,
  AdmissionService,
  type AppointmentRepository,
  AppointmentService,
  type CentreProfileRepository,
  CentreProfileService,
  type ClinicianRepository,
  ClinicianService,
  type EmployeeDirectory,
  EncounterService,
  type EncounterRepository,
  type HealthCentreRepository,
  HealthCentreService,
  type OrganizationDirectory,
  type PersonDirectory,
  type PrescriptionRepository,
  PrescriptionService,
  type ReferralRepository,
  ReferralService,
} from "@knowget/health-centre";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import type { EmployeeService } from "@knowget/workforce";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { WorkforceModule } from "../workforce/workforce.module";
import { WF_EMPLOYEE_SERVICE } from "../workforce/workforce.tokens";
import { AppointmentController } from "./appointment.controller";
import { CentreProfileController } from "./centre-profile.controller";
import { ClinicalEncounterController } from "./clinical-encounter.controller";
import { ClinicianController } from "./clinician.controller";
import {
  EmployeeServiceDirectory,
  OrganizationServiceDirectory,
  PersonServiceDirectory,
} from "./directory.adapters";
import { HealthCentreController } from "./health-centre.controller";
import {
  HC_ADMISSION_REPOSITORY,
  HC_ADMISSION_SERVICE,
  HC_APPOINTMENT_REPOSITORY,
  HC_APPOINTMENT_SERVICE,
  HC_CENTRE_REPOSITORY,
  HC_CENTRE_SERVICE,
  HC_CLINICIAN_REPOSITORY,
  HC_CLINICIAN_SERVICE,
  HC_EMPLOYEE_DIRECTORY,
  HC_ENCOUNTER_REPOSITORY,
  HC_ENCOUNTER_SERVICE,
  HC_ORGANIZATION_DIRECTORY,
  HC_PERSON_DIRECTORY,
  HC_PRESCRIPTION_REPOSITORY,
  HC_PRESCRIPTION_SERVICE,
  HC_PROFILE_REPOSITORY,
  HC_PROFILE_SERVICE,
  HC_REFERRAL_REPOSITORY,
  HC_REFERRAL_SERVICE,
} from "./health-centre.tokens";
import { PrismaAdmissionRepository } from "./prisma-sick-bay-admission.repository";
import { PrismaAppointmentRepository } from "./prisma-appointment.repository";
import { PrismaCentreProfileRepository } from "./prisma-centre-profile.repository";
import { PrismaClinicianRepository } from "./prisma-clinician.repository";
import { PrismaEncounterRepository } from "./prisma-clinical-encounter.repository";
import { PrismaHealthCentreRepository } from "./prisma-health-centre.repository";
import { PrismaPrescriptionRepository } from "./prisma-prescription.repository";
import { PrismaReferralRepository } from "./prisma-referral.repository";
import { PrescriptionController } from "./prescription.controller";
import { ReferralController } from "./referral.controller";
import { SickBayAdmissionController } from "./sick-bay-admission.controller";

const repositories: Provider[] = [
  {
    provide: HC_CENTRE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaHealthCentreRepository(db),
    inject: [DATABASE],
  },
  {
    provide: HC_CLINICIAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaClinicianRepository(db),
    inject: [DATABASE],
  },
  {
    provide: HC_APPOINTMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAppointmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: HC_ENCOUNTER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEncounterRepository(db),
    inject: [DATABASE],
  },
  {
    provide: HC_PRESCRIPTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaPrescriptionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: HC_ADMISSION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAdmissionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: HC_REFERRAL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaReferralRepository(db),
    inject: [DATABASE],
  },
  {
    provide: HC_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCentreProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: HC_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: HC_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
  {
    provide: HC_EMPLOYEE_DIRECTORY,
    useFactory: (employees: EmployeeService) => new EmployeeServiceDirectory(employees),
    inject: [WF_EMPLOYEE_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: HC_CENTRE_SERVICE,
    useFactory: (
      repository: HealthCentreRepository,
      organizations: OrganizationDirectory,
      clinicians: ClinicianRepository,
      events: EventBus,
    ) => new HealthCentreService({ repository, organizations, clinicians, events }),
    inject: [HC_CENTRE_REPOSITORY, HC_ORGANIZATION_DIRECTORY, HC_CLINICIAN_REPOSITORY, EVENT_BUS],
  },
  {
    provide: HC_CLINICIAN_SERVICE,
    useFactory: (repository: ClinicianRepository, employees: EmployeeDirectory, events: EventBus) =>
      new ClinicianService({ repository, employees, events }),
    inject: [HC_CLINICIAN_REPOSITORY, HC_EMPLOYEE_DIRECTORY, EVENT_BUS],
  },
  {
    provide: HC_APPOINTMENT_SERVICE,
    useFactory: (
      repository: AppointmentRepository,
      centres: HealthCentreRepository,
      persons: PersonDirectory,
      clinicians: ClinicianRepository,
      events: EventBus,
    ) => new AppointmentService({ repository, centres, persons, clinicians, events }),
    inject: [
      HC_APPOINTMENT_REPOSITORY,
      HC_CENTRE_REPOSITORY,
      HC_PERSON_DIRECTORY,
      HC_CLINICIAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: HC_ENCOUNTER_SERVICE,
    useFactory: (
      repository: EncounterRepository,
      centres: HealthCentreRepository,
      persons: PersonDirectory,
      clinicians: ClinicianRepository,
      events: EventBus,
    ) => new EncounterService({ repository, centres, persons, clinicians, events }),
    inject: [
      HC_ENCOUNTER_REPOSITORY,
      HC_CENTRE_REPOSITORY,
      HC_PERSON_DIRECTORY,
      HC_CLINICIAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: HC_PRESCRIPTION_SERVICE,
    useFactory: (
      repository: PrescriptionRepository,
      centres: HealthCentreRepository,
      persons: PersonDirectory,
      clinicians: ClinicianRepository,
      events: EventBus,
    ) => new PrescriptionService({ repository, centres, persons, clinicians, events }),
    inject: [
      HC_PRESCRIPTION_REPOSITORY,
      HC_CENTRE_REPOSITORY,
      HC_PERSON_DIRECTORY,
      HC_CLINICIAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: HC_ADMISSION_SERVICE,
    useFactory: (
      repository: AdmissionRepository,
      centres: HealthCentreRepository,
      persons: PersonDirectory,
      events: EventBus,
    ) => new AdmissionService({ repository, centres, persons, events }),
    inject: [HC_ADMISSION_REPOSITORY, HC_CENTRE_REPOSITORY, HC_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: HC_REFERRAL_SERVICE,
    useFactory: (
      repository: ReferralRepository,
      centres: HealthCentreRepository,
      persons: PersonDirectory,
      clinicians: ClinicianRepository,
      events: EventBus,
    ) => new ReferralService({ repository, centres, persons, clinicians, events }),
    inject: [
      HC_REFERRAL_REPOSITORY,
      HC_CENTRE_REPOSITORY,
      HC_PERSON_DIRECTORY,
      HC_CLINICIAN_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: HC_PROFILE_SERVICE,
    useFactory: (
      repository: CentreProfileRepository,
      centres: HealthCentreRepository,
      admissions: AdmissionRepository,
      appointments: AppointmentRepository,
      encounters: EncounterRepository,
      prescriptions: PrescriptionRepository,
      referrals: ReferralRepository,
      events: EventBus,
    ) =>
      new CentreProfileService({
        repository,
        centres,
        admissions,
        appointments,
        encounters,
        prescriptions,
        referrals,
        events,
      }),
    inject: [
      HC_PROFILE_REPOSITORY,
      HC_CENTRE_REPOSITORY,
      HC_ADMISSION_REPOSITORY,
      HC_APPOINTMENT_REPOSITORY,
      HC_ENCOUNTER_REPOSITORY,
      HC_PRESCRIPTION_REPOSITORY,
      HC_REFERRAL_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Integrated Health Centre & Clinical Services Platform (P2-D19) — the institution's operational
 * clinical system of record, and the first contract of Program D (Campus & Engagement). Follows the domain
 * architecture pattern (ADR-0010): the pure `@knowget/health-centre` package (eight aggregates plus the
 * sick-bay-occupancy and medication-schedule engines) behind repository ports, Prisma/RLS adapters,
 * application services on the platform event bus, and permission-gated, tenant-scoped REST controllers.
 * Money is deliberately absent (clinical services are not billed here → Finance P2-D14; medical supplies →
 * Procurement/Assets P2-D15), and domain events carry no clinical content. The standing health record
 * (history, allergies, chronic conditions, immunization history, standing medications, alerts) belongs to
 * Learner Wellbeing (P2-D05); this domain holds the operational clinical services. `clinic:*` gates the
 * clinical estate and its people and oversight (centres, clinicians, the centre profile); `clinical:*`
 * gates the patient-facing operations (appointments, encounters, prescriptions, sick-bay admissions,
 * referrals). Organization (P2-D01-M01), Person (P2-D01-M02, the patients) and Employee (P2-D12, the
 * clinicians) existence enter through injected directory ports; the domain links to them and never depends
 * on their packages directly. Exports every service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule, WorkforceModule],
  controllers: [
    HealthCentreController,
    ClinicianController,
    CentreProfileController,
    AppointmentController,
    ClinicalEncounterController,
    PrescriptionController,
    SickBayAdmissionController,
    ReferralController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    HC_CENTRE_SERVICE,
    HC_CLINICIAN_SERVICE,
    HC_APPOINTMENT_SERVICE,
    HC_ENCOUNTER_SERVICE,
    HC_PRESCRIPTION_SERVICE,
    HC_ADMISSION_SERVICE,
    HC_REFERRAL_SERVICE,
    HC_PROFILE_SERVICE,
  ],
})
export class HealthCentreModule {}
