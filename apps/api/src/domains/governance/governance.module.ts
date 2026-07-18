import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  CommitteeService,
  DelegationService,
  GovernanceApprovalService,
  GovernanceBodyService,
  GovernanceCalendarService,
  PolicyService,
  ResolutionService,
  type CommitteeRepository,
  type DelegationRepository,
  type GovernanceApprovalRepository,
  type GovernanceBodyRepository,
  type GovernanceCalendarRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  type PolicyAcknowledgmentRepository,
  type PolicyRepository,
  type ResolutionRepository,
} from "@knowget/governance";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { CommitteeController } from "./committee.controller";
import { DelegationController } from "./delegation.controller";
import { OrganizationServiceDirectory, PersonServiceDirectory } from "./directory.adapters";
import { GovernanceApprovalController } from "./governance-approval.controller";
import { GovernanceBodyController } from "./governance-body.controller";
import { GovernanceCalendarController } from "./governance-calendar.controller";
import {
  GOVERNANCE_APPROVAL_REPOSITORY,
  GOVERNANCE_APPROVAL_SERVICE,
  GOVERNANCE_BODY_REPOSITORY,
  GOVERNANCE_BODY_SERVICE,
  GOVERNANCE_CALENDAR_REPOSITORY,
  GOVERNANCE_CALENDAR_SERVICE,
  GOVERNANCE_COMMITTEE_REPOSITORY,
  GOVERNANCE_COMMITTEE_SERVICE,
  GOVERNANCE_DELEGATION_REPOSITORY,
  GOVERNANCE_DELEGATION_SERVICE,
  GOVERNANCE_ORGANIZATION_DIRECTORY,
  GOVERNANCE_PERSON_DIRECTORY,
  GOVERNANCE_POLICY_ACK_REPOSITORY,
  GOVERNANCE_POLICY_REPOSITORY,
  GOVERNANCE_POLICY_SERVICE,
  GOVERNANCE_RESOLUTION_REPOSITORY,
  GOVERNANCE_RESOLUTION_SERVICE,
} from "./governance.tokens";
import { PolicyController } from "./policy.controller";
import { PrismaGovernanceApprovalRepository } from "./prisma-governance-approval.repository";
import { PrismaGovernanceBodyRepository } from "./prisma-governance-body.repository";
import { PrismaGovernanceCalendarRepository } from "./prisma-governance-calendar.repository";
import { PrismaGovernanceCommitteeRepository } from "./prisma-governance-committee.repository";
import { PrismaGovernanceDelegationRepository } from "./prisma-governance-delegation.repository";
import {
  PrismaGovernancePolicyAcknowledgmentRepository,
  PrismaGovernancePolicyRepository,
} from "./prisma-governance-policy.repository";
import { PrismaGovernanceResolutionRepository } from "./prisma-governance-resolution.repository";
import { ResolutionController } from "./resolution.controller";

const repositories: Provider[] = [
  {
    provide: GOVERNANCE_BODY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernanceBodyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GOVERNANCE_COMMITTEE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernanceCommitteeRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GOVERNANCE_POLICY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernancePolicyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GOVERNANCE_POLICY_ACK_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernancePolicyAcknowledgmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GOVERNANCE_DELEGATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernanceDelegationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GOVERNANCE_RESOLUTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernanceResolutionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GOVERNANCE_CALENDAR_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernanceCalendarRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GOVERNANCE_APPROVAL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernanceApprovalRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: GOVERNANCE_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: GOVERNANCE_PERSON_DIRECTORY,
    useFactory: (persons: PersonService) => new PersonServiceDirectory(persons),
    inject: [PERSON_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: GOVERNANCE_BODY_SERVICE,
    useFactory: (
      repository: GovernanceBodyRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new GovernanceBodyService({ repository, organizations, events }),
    inject: [GOVERNANCE_BODY_REPOSITORY, GOVERNANCE_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: GOVERNANCE_COMMITTEE_SERVICE,
    useFactory: (
      repository: CommitteeRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      governanceBodies: GovernanceBodyRepository,
      events: EventBus,
    ) => new CommitteeService({ repository, organizations, persons, governanceBodies, events }),
    inject: [
      GOVERNANCE_COMMITTEE_REPOSITORY,
      GOVERNANCE_ORGANIZATION_DIRECTORY,
      GOVERNANCE_PERSON_DIRECTORY,
      GOVERNANCE_BODY_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: GOVERNANCE_POLICY_SERVICE,
    useFactory: (
      repository: PolicyRepository,
      acknowledgments: PolicyAcknowledgmentRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new PolicyService({ repository, acknowledgments, organizations, persons, events }),
    inject: [
      GOVERNANCE_POLICY_REPOSITORY,
      GOVERNANCE_POLICY_ACK_REPOSITORY,
      GOVERNANCE_ORGANIZATION_DIRECTORY,
      GOVERNANCE_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: GOVERNANCE_DELEGATION_SERVICE,
    useFactory: (
      repository: DelegationRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      events: EventBus,
    ) => new DelegationService({ repository, organizations, persons, events }),
    inject: [
      GOVERNANCE_DELEGATION_REPOSITORY,
      GOVERNANCE_ORGANIZATION_DIRECTORY,
      GOVERNANCE_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: GOVERNANCE_RESOLUTION_SERVICE,
    useFactory: (
      repository: ResolutionRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
      governanceBodies: GovernanceBodyRepository,
      events: EventBus,
    ) => new ResolutionService({ repository, organizations, persons, governanceBodies, events }),
    inject: [
      GOVERNANCE_RESOLUTION_REPOSITORY,
      GOVERNANCE_ORGANIZATION_DIRECTORY,
      GOVERNANCE_PERSON_DIRECTORY,
      GOVERNANCE_BODY_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: GOVERNANCE_CALENDAR_SERVICE,
    useFactory: (
      repository: GovernanceCalendarRepository,
      organizations: OrganizationDirectory,
      governanceBodies: GovernanceBodyRepository,
      committees: CommitteeRepository,
      persons: PersonDirectory,
    ) =>
      new GovernanceCalendarService({
        repository,
        organizations,
        governanceBodies,
        committees,
        persons,
      }),
    inject: [
      GOVERNANCE_CALENDAR_REPOSITORY,
      GOVERNANCE_ORGANIZATION_DIRECTORY,
      GOVERNANCE_BODY_REPOSITORY,
      GOVERNANCE_COMMITTEE_REPOSITORY,
      GOVERNANCE_PERSON_DIRECTORY,
    ],
  },
  {
    provide: GOVERNANCE_APPROVAL_SERVICE,
    useFactory: (
      repository: GovernanceApprovalRepository,
      organizations: OrganizationDirectory,
      persons: PersonDirectory,
    ) => new GovernanceApprovalService({ repository, organizations, persons }),
    inject: [
      GOVERNANCE_APPROVAL_REPOSITORY,
      GOVERNANCE_ORGANIZATION_DIRECTORY,
      GOVERNANCE_PERSON_DIRECTORY,
    ],
  },
];

/**
 * The Institutional Governance Platform (P2-D02) — governance bodies, committees,
 * the policy registry, delegations of authority, resolutions and the governance
 * calendar as one integrated domain. Follows the domain architecture pattern
 * (ADR-0010): the pure `@knowget/governance` package behind repository ports,
 * Prisma/RLS adapters, application services on the platform event bus, and
 * permission-gated REST controllers. Organization and Person existence enter
 * through injected directory ports; imports `OrganizationModule` and `PersonModule`
 * for them.
 */
@Module({
  imports: [OrganizationModule, PersonModule],
  controllers: [
    GovernanceBodyController,
    CommitteeController,
    PolicyController,
    DelegationController,
    ResolutionController,
    GovernanceCalendarController,
    GovernanceApprovalController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    GOVERNANCE_BODY_SERVICE,
    GOVERNANCE_COMMITTEE_SERVICE,
    GOVERNANCE_POLICY_SERVICE,
    GOVERNANCE_DELEGATION_SERVICE,
    GOVERNANCE_RESOLUTION_SERVICE,
    GOVERNANCE_CALENDAR_SERVICE,
    GOVERNANCE_APPROVAL_SERVICE,
  ],
})
export class GovernanceModule {}
