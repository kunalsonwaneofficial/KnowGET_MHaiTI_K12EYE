import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  CommunicationProfileService,
  ConsentService,
  EmergencyContactService,
  FamilyIntelligenceProfileService,
  FamilyService,
  GuardianService,
  StudentGuardianRelationshipService,
  type CommunicationProfileRepository,
  type ConsentRepository,
  type EmergencyContactRepository,
  type FamilyIntelligenceProfileRepository,
  type FamilyRepository,
  type GuardianRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  type PolicyDirectory,
  type StudentDirectory,
  type StudentGuardianRelationshipRepository,
} from "@knowget/family-guardian";
import type { PolicyService } from "@knowget/governance";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import type { StudentService } from "@knowget/student-lifecycle";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { GovernanceModule } from "../governance/governance.module";
import { GOVERNANCE_POLICY_SERVICE } from "../governance/governance.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { StudentLifecycleModule } from "../student-lifecycle/student-lifecycle.module";
import { STUDENT_SERVICE } from "../student-lifecycle/student-lifecycle.tokens";
import { CommunicationProfileController } from "./communication-profile.controller";
import { ConsentController } from "./consent.controller";
import {
  OrganizationServiceDirectory,
  PersonServiceDirectory,
  PolicyServiceDirectory,
  StudentServiceDirectory,
} from "./directory.adapters";
import { EmergencyContactController } from "./emergency-contact.controller";
import { FamilyController } from "./family.controller";
import { FamilyIntelligenceProfileController } from "./family-intelligence-profile.controller";
import { GuardianController } from "./guardian.controller";
import { PrismaCommunicationProfileRepository } from "./prisma-communication-profile.repository";
import { PrismaEmergencyContactRepository } from "./prisma-emergency-contact.repository";
import { PrismaFamilyConsentRepository } from "./prisma-family-consent.repository";
import { PrismaFamilyIntelligenceProfileRepository } from "./prisma-family-intelligence-profile.repository";
import { PrismaFamilyRepository } from "./prisma-family.repository";
import { PrismaGuardianRepository } from "./prisma-guardian.repository";
import { PrismaStudentGuardianRelationshipRepository } from "./prisma-student-guardian-relationship.repository";
import { StudentGuardianRelationshipController } from "./student-guardian-relationship.controller";
import {
  FAMILY_REPOSITORY,
  FAMILY_SERVICE,
  FG_COMMUNICATION_PROFILE_REPOSITORY,
  FG_COMMUNICATION_PROFILE_SERVICE,
  FG_CONSENT_REPOSITORY,
  FG_CONSENT_SERVICE,
  FG_EMERGENCY_CONTACT_REPOSITORY,
  FG_EMERGENCY_CONTACT_SERVICE,
  FG_INTELLIGENCE_PROFILE_REPOSITORY,
  FG_INTELLIGENCE_PROFILE_SERVICE,
  FG_ORGANIZATION_DIRECTORY,
  FG_PERSON_DIRECTORY,
  FG_POLICY_DIRECTORY,
  FG_RELATIONSHIP_REPOSITORY,
  FG_RELATIONSHIP_SERVICE,
  FG_STUDENT_DIRECTORY,
  GUARDIAN_REPOSITORY,
  GUARDIAN_SERVICE,
} from "./family-guardian.tokens";

const repositories: Provider[] = [
  {
    provide: FAMILY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFamilyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GUARDIAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGuardianRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FG_RELATIONSHIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStudentGuardianRelationshipRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FG_CONSENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFamilyConsentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FG_EMERGENCY_CONTACT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEmergencyContactRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FG_COMMUNICATION_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCommunicationProfileRepository(db),
    inject: [DATABASE],
  },
  {
    provide: FG_INTELLIGENCE_PROFILE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaFamilyIntelligenceProfileRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: FG_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
  {
    provide: FG_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: FG_STUDENT_DIRECTORY,
    useFactory: (students: StudentService) => new StudentServiceDirectory(students),
    inject: [STUDENT_SERVICE],
  },
  {
    provide: FG_POLICY_DIRECTORY,
    useFactory: (policies: PolicyService) => new PolicyServiceDirectory(policies),
    inject: [GOVERNANCE_POLICY_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: FAMILY_SERVICE,
    useFactory: (
      repository: FamilyRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new FamilyService({ repository, persons, organizations, events }),
    inject: [FAMILY_REPOSITORY, FG_PERSON_DIRECTORY, FG_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: GUARDIAN_SERVICE,
    useFactory: (
      repository: GuardianRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new GuardianService({ repository, persons, organizations, events }),
    inject: [GUARDIAN_REPOSITORY, FG_PERSON_DIRECTORY, FG_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FG_RELATIONSHIP_SERVICE,
    useFactory: (
      repository: StudentGuardianRelationshipRepository,
      guardians: GuardianRepository,
      students: StudentDirectory,
      events: EventBus,
    ) => new StudentGuardianRelationshipService({ repository, guardians, students, events }),
    inject: [FG_RELATIONSHIP_REPOSITORY, GUARDIAN_REPOSITORY, FG_STUDENT_DIRECTORY, EVENT_BUS],
  },
  {
    provide: FG_CONSENT_SERVICE,
    useFactory: (
      repository: ConsentRepository,
      guardians: GuardianRepository,
      students: StudentDirectory,
      policies: PolicyDirectory,
      events: EventBus,
    ) => new ConsentService({ repository, guardians, students, policies, events }),
    inject: [
      FG_CONSENT_REPOSITORY,
      GUARDIAN_REPOSITORY,
      FG_STUDENT_DIRECTORY,
      FG_POLICY_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: FG_EMERGENCY_CONTACT_SERVICE,
    useFactory: (
      repository: EmergencyContactRepository,
      persons: PersonDirectory,
      organizations: OrganizationDirectory,
      students: StudentDirectory,
      events: EventBus,
    ) => new EmergencyContactService({ repository, persons, organizations, students, events }),
    inject: [
      FG_EMERGENCY_CONTACT_REPOSITORY,
      FG_PERSON_DIRECTORY,
      FG_ORGANIZATION_DIRECTORY,
      FG_STUDENT_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: FG_COMMUNICATION_PROFILE_SERVICE,
    useFactory: (repository: CommunicationProfileRepository, families: FamilyRepository) =>
      new CommunicationProfileService({ repository, families }),
    inject: [FG_COMMUNICATION_PROFILE_REPOSITORY, FAMILY_REPOSITORY],
  },
  {
    provide: FG_INTELLIGENCE_PROFILE_SERVICE,
    useFactory: (repository: FamilyIntelligenceProfileRepository, families: FamilyRepository) =>
      new FamilyIntelligenceProfileService({ repository, families }),
    inject: [FG_INTELLIGENCE_PROFILE_REPOSITORY, FAMILY_REPOSITORY],
  },
];

/**
 * The Family & Guardian Intelligence Platform (P2-D04) — the authoritative domain for
 * families, guardianship, student–guardian relationships, institutional consent,
 * emergency contacts and per-family communication and intelligence profiles. Follows
 * the domain architecture pattern (ADR-0010): the pure `@knowget/family-guardian`
 * package behind repository ports, Prisma/RLS adapters, application services on the
 * platform event bus, and permission-gated REST controllers. Person, Organization,
 * Student (P2-D03) and Policy (P2-D02) existence enter through injected directory
 * ports; imports their modules. Guardian and Family repositories are shared with the
 * relationship, consent and profile services so they derive organization and validate
 * custody without re-modelling.
 */
@Module({
  imports: [OrganizationModule, PersonModule, StudentLifecycleModule, GovernanceModule],
  controllers: [
    FamilyController,
    GuardianController,
    StudentGuardianRelationshipController,
    ConsentController,
    EmergencyContactController,
    CommunicationProfileController,
    FamilyIntelligenceProfileController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    FAMILY_SERVICE,
    GUARDIAN_SERVICE,
    FG_RELATIONSHIP_SERVICE,
    FG_CONSENT_SERVICE,
    FG_EMERGENCY_CONTACT_SERVICE,
    FG_COMMUNICATION_PROFILE_SERVICE,
    FG_INTELLIGENCE_PROFILE_SERVICE,
  ],
})
export class FamilyGuardianModule {}
