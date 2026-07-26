import {
  type AccessCredentialRepository,
  AccessCredentialService,
  AccessDecisionService,
  type AccessEventRepository,
  AccessEventService,
  type AccessZoneRepository,
  AccessZoneService,
  type EmergencyDrillRepository,
  EmergencyDrillService,
  type EmployeeDirectory,
  type OrganizationDirectory,
  type PersonDirectory,
  type SafetyProfileRepository,
  SafetyProfileService,
  type SecurityIncidentRepository,
  SecurityIncidentService,
  type VisitRepository,
  VisitService,
  type VisitorRepository,
  VisitorService,
} from "@knowget/campus-security";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
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
import { AccessController } from "./access.controller";
import { AccessCredentialController } from "./access-credential.controller";
import { AccessZoneController } from "./access-zone.controller";
import {
  CS_ACCESS_DECISION_SERVICE,
  CS_ACCESS_EVENT_REPOSITORY,
  CS_ACCESS_EVENT_SERVICE,
  CS_CREDENTIAL_REPOSITORY,
  CS_CREDENTIAL_SERVICE,
  CS_DRILL_REPOSITORY,
  CS_DRILL_SERVICE,
  CS_EMPLOYEE_DIRECTORY,
  CS_INCIDENT_REPOSITORY,
  CS_INCIDENT_SERVICE,
  CS_ORGANIZATION_DIRECTORY,
  CS_PERSON_DIRECTORY,
  CS_PROFILE_REPOSITORY,
  CS_PROFILE_SERVICE,
  CS_VISIT_REPOSITORY,
  CS_VISIT_SERVICE,
  CS_VISITOR_REPOSITORY,
  CS_VISITOR_SERVICE,
  CS_ZONE_REPOSITORY,
  CS_ZONE_SERVICE,
} from "./campus-security.tokens";
import {
  EmployeeServiceDirectory,
  OrganizationServiceDirectory,
  PersonServiceDirectory,
} from "./directory.adapters";
import { EmergencyDrillController } from "./emergency-drill.controller";
import { PrismaAccessCredentialRepository } from "./prisma-access-credential.repository";
import { PrismaAccessEventRepository } from "./prisma-access-event.repository";
import { PrismaAccessZoneRepository } from "./prisma-access-zone.repository";
import { PrismaEmergencyDrillRepository } from "./prisma-emergency-drill.repository";
import { PrismaSafetyProfileRepository } from "./prisma-safety-profile.repository";
import { PrismaSecurityIncidentRepository } from "./prisma-security-incident.repository";
import { PrismaVisitRepository } from "./prisma-visit.repository";
import { PrismaVisitorRepository } from "./prisma-visitor.repository";
import { SafetyProfileController } from "./safety-profile.controller";
import { SecurityIncidentController } from "./security-incident.controller";
import { VisitController } from "./visit.controller";
import { VisitorController } from "./visitor.controller";

const repositories: Provider[] = [
  {
    provide: CS_ZONE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAccessZoneRepository(db),
    inject: [DATABASE],
  },
  {
    provide: CS_VISITOR_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaVisitorRepository(db),
    inject: [DATABASE],
  },
  {
    provide: CS_VISIT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaVisitRepository(db),
    inject: [DATABASE],
  },
  {
    provide: CS_CREDENTIAL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAccessCredentialRepository(db),
    inject: [DATABASE],
  },
  {
    provide: CS_ACCESS_EVENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAccessEventRepository(db),
    inject: [DATABASE],
  },
  {
    provide: CS_INCIDENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSecurityIncidentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: CS_DRILL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEmergencyDrillRepository(db),
    inject: [DATABASE],
  },
  {
    provide: CS_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSafetyProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: CS_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: CS_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
  {
    provide: CS_EMPLOYEE_DIRECTORY,
    useFactory: (employees: EmployeeService) => new EmployeeServiceDirectory(employees),
    inject: [WF_EMPLOYEE_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: CS_ZONE_SERVICE,
    useFactory: (
      repository: AccessZoneRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AccessZoneService({ repository, organizations, events }),
    inject: [CS_ZONE_REPOSITORY, CS_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: CS_VISITOR_SERVICE,
    useFactory: (
      repository: VisitorRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new VisitorService({ repository, organizations, events }),
    inject: [CS_VISITOR_REPOSITORY, CS_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: CS_VISIT_SERVICE,
    useFactory: (
      repository: VisitRepository,
      visitors: VisitorRepository,
      persons: PersonDirectory,
      zones: AccessZoneRepository,
      events: EventBus,
    ) => new VisitService({ repository, visitors, persons, zones, events }),
    inject: [
      CS_VISIT_REPOSITORY,
      CS_VISITOR_REPOSITORY,
      CS_PERSON_DIRECTORY,
      CS_ZONE_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: CS_CREDENTIAL_SERVICE,
    useFactory: (
      repository: AccessCredentialRepository,
      organizations: OrganizationDirectory,
      zones: AccessZoneRepository,
      employees: EmployeeDirectory,
      persons: PersonDirectory,
      visitors: VisitorRepository,
      events: EventBus,
    ) =>
      new AccessCredentialService({
        repository,
        organizations,
        zones,
        employees,
        persons,
        visitors,
        events,
      }),
    inject: [
      CS_CREDENTIAL_REPOSITORY,
      CS_ORGANIZATION_DIRECTORY,
      CS_ZONE_REPOSITORY,
      CS_EMPLOYEE_DIRECTORY,
      CS_PERSON_DIRECTORY,
      CS_VISITOR_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: CS_ACCESS_EVENT_SERVICE,
    useFactory: (repository: AccessEventRepository, events: EventBus) =>
      new AccessEventService({ repository, events }),
    inject: [CS_ACCESS_EVENT_REPOSITORY, EVENT_BUS],
  },
  {
    provide: CS_INCIDENT_SERVICE,
    useFactory: (
      repository: SecurityIncidentRepository,
      organizations: OrganizationDirectory,
      zones: AccessZoneRepository,
      persons: PersonDirectory,
      employees: EmployeeDirectory,
      events: EventBus,
    ) =>
      new SecurityIncidentService({ repository, organizations, zones, persons, employees, events }),
    inject: [
      CS_INCIDENT_REPOSITORY,
      CS_ORGANIZATION_DIRECTORY,
      CS_ZONE_REPOSITORY,
      CS_PERSON_DIRECTORY,
      CS_EMPLOYEE_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: CS_DRILL_SERVICE,
    useFactory: (
      repository: EmergencyDrillRepository,
      organizations: OrganizationDirectory,
      zones: AccessZoneRepository,
      employees: EmployeeDirectory,
      events: EventBus,
    ) => new EmergencyDrillService({ repository, organizations, zones, employees, events }),
    inject: [
      CS_DRILL_REPOSITORY,
      CS_ORGANIZATION_DIRECTORY,
      CS_ZONE_REPOSITORY,
      CS_EMPLOYEE_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: CS_PROFILE_SERVICE,
    useFactory: (
      repository: SafetyProfileRepository,
      zones: AccessZoneRepository,
      visits: VisitRepository,
      incidents: SecurityIncidentRepository,
      credentials: AccessCredentialRepository,
      accessEvents: AccessEventRepository,
      events: EventBus,
    ) =>
      new SafetyProfileService({
        repository,
        zones,
        visits,
        incidents,
        credentials,
        accessEvents,
        events,
      }),
    inject: [
      CS_PROFILE_REPOSITORY,
      CS_ZONE_REPOSITORY,
      CS_VISIT_REPOSITORY,
      CS_INCIDENT_REPOSITORY,
      CS_CREDENTIAL_REPOSITORY,
      CS_ACCESS_EVENT_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: CS_ACCESS_DECISION_SERVICE,
    useFactory: (
      credentials: AccessCredentialRepository,
      zones: AccessZoneRepository,
      accessEvents: AccessEventRepository,
      events: EventBus,
    ) => new AccessDecisionService({ credentials, zones, accessEvents, events }),
    inject: [CS_CREDENTIAL_REPOSITORY, CS_ZONE_REPOSITORY, CS_ACCESS_EVENT_REPOSITORY, EVENT_BUS],
  },
];

/**
 * The Campus Security, Safety & Visitor Platform (P2-D21) — the institution's security-operations system of
 * record, and the third contract of Program D (Campus & Engagement). Follows the domain architecture pattern
 * (ADR-0010): the pure `@knowget/campus-security` package (eight aggregates plus the presence and access
 * engines, and the access-decision spine) behind repository ports, Prisma/RLS adapters, application services
 * on the platform event bus, and permission-gated, tenant-scoped REST controllers. Money is deliberately
 * absent (security-service billing/procurement → Finance P2-D14 / Procurement & Assets P2-D15), and domain
 * events carry no money and no free text (no visitor name/contact, no incident summary). The standing
 * safeguarding record is Learner Wellbeing's (P2-D05) and clinical incidents are the Health Centre's
 * (P2-D19). `security:*` gates the security-operations centre (zones, credentials, the access decision +
 * immutable door log, incidents, drills, the safety profile); `visitor:*` gates front-desk visitor
 * management (visitors, visits). Organization (P2-D01-M01), Person (P2-D01-M02) and Employee (P2-D12)
 * existence enter through injected directory ports; the domain links to them and never depends on their
 * packages directly. Exports every service token.
 */
@Module({
  imports: [OrganizationModule, PersonModule, WorkforceModule],
  controllers: [
    AccessZoneController,
    VisitorController,
    VisitController,
    AccessCredentialController,
    AccessController,
    SecurityIncidentController,
    EmergencyDrillController,
    SafetyProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    CS_ZONE_SERVICE,
    CS_VISITOR_SERVICE,
    CS_VISIT_SERVICE,
    CS_CREDENTIAL_SERVICE,
    CS_ACCESS_EVENT_SERVICE,
    CS_INCIDENT_SERVICE,
    CS_DRILL_SERVICE,
    CS_PROFILE_SERVICE,
    CS_ACCESS_DECISION_SERVICE,
  ],
})
export class CampusSecurityModule {}
