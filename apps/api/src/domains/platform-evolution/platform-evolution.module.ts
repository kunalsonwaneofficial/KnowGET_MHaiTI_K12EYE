import type { EvaluationService } from "@knowget/assessment-evaluation";
import type { PrismaService } from "@knowget/database";
import type { DecisionService } from "@knowget/decision-intelligence";
import type { EventBus } from "@knowget/events";
import type { AttentionItemService } from "@knowget/executive-intelligence";
import type {
  AssertionService,
  KnowledgeEntityService,
  KnowledgeMemoryService,
} from "@knowget/knowledge-graph";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import {
  type AdoptionReviewRepository,
  AdoptionReviewService,
  type EvidenceRecordDirectory,
  type GovernanceDecisionRepository,
  GovernanceDecisionService,
  type ImprovementCycleRepository,
  ImprovementCycleService,
  type ImprovementInitiativeRepository,
  ImprovementInitiativeService,
  type ImprovementSignalRepository,
  ImprovementSignalService,
  type InstitutionalMemoryDirectory,
  type LessonRepository,
  LessonService,
  type MaturityAssessmentRepository,
  MaturityAssessmentService,
  type OrganizationDirectory,
  type PersonDirectory,
} from "@knowget/platform-evolution";
import type { ForecastRunService } from "@knowget/predictive-intelligence";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AssessmentEvaluationModule } from "../assessment-evaluation/assessment-evaluation.module";
import { AE_EVALUATION_SERVICE } from "../assessment-evaluation/assessment-evaluation.tokens";
import { DecisionIntelligenceModule } from "../decision-intelligence/decision-intelligence.module";
import { DI_DECISION_SERVICE } from "../decision-intelligence/decision-intelligence.tokens";
import { ExecutiveIntelligenceModule } from "../executive-intelligence/executive-intelligence.module";
import { EI_ATTENTION_ITEM_SERVICE } from "../executive-intelligence/executive-intelligence.tokens";
import { KnowledgeGraphModule } from "../knowledge-graph/knowledge-graph.module";
import {
  KG_ASSERTION_SERVICE,
  KG_ENTITY_SERVICE,
  KG_MEMORY_SERVICE,
} from "../knowledge-graph/knowledge-graph.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { PredictiveIntelligenceModule } from "../predictive-intelligence/predictive-intelligence.module";
import { PI_FORECAST_RUN_SERVICE } from "../predictive-intelligence/predictive-intelligence.tokens";
import { AdoptionReviewController } from "./adoption-review.controller";
import {
  KnowledgeGraphMemoryDirectory,
  OrganizationServiceDirectory,
  PersonServiceDirectory,
  PlatformEvidenceRecordDirectory,
} from "./directory.adapters";
import { GovernanceDecisionController } from "./governance-decision.controller";
import { ImprovementCycleController } from "./improvement-cycle.controller";
import { ImprovementInitiativeController } from "./improvement-initiative.controller";
import { ImprovementSignalController } from "./improvement-signal.controller";
import { LessonController } from "./lesson.controller";
import { MaturityAssessmentController } from "./maturity-assessment.controller";
import {
  PE_ADOPTION_REVIEW_REPOSITORY,
  PE_ADOPTION_REVIEW_SERVICE,
  PE_ASSESSMENT_REPOSITORY,
  PE_ASSESSMENT_SERVICE,
  PE_CYCLE_REPOSITORY,
  PE_CYCLE_SERVICE,
  PE_DECISION_REPOSITORY,
  PE_DECISION_SERVICE,
  PE_EVIDENCE_DIRECTORY,
  PE_INITIATIVE_REPOSITORY,
  PE_INITIATIVE_SERVICE,
  PE_LESSON_REPOSITORY,
  PE_LESSON_SERVICE,
  PE_MEMORY_DIRECTORY,
  PE_ORGANIZATION_DIRECTORY,
  PE_PERSON_DIRECTORY,
  PE_SIGNAL_REPOSITORY,
  PE_SIGNAL_SERVICE,
} from "./platform-evolution.tokens";
import { PrismaAdoptionReviewRepository } from "./prisma-adoption-review.repository";
import { PrismaGovernanceDecisionRepository } from "./prisma-governance-decision.repository";
import { PrismaImprovementCycleRepository } from "./prisma-improvement-cycle.repository";
import { PrismaImprovementInitiativeRepository } from "./prisma-improvement-initiative.repository";
import { PrismaImprovementSignalRepository } from "./prisma-improvement-signal.repository";
import { PrismaLessonRepository } from "./prisma-lesson.repository";
import { PrismaMaturityAssessmentRepository } from "./prisma-maturity-assessment.repository";

const repositories: Provider[] = [
  {
    provide: PE_SIGNAL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaImprovementSignalRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PE_INITIATIVE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaImprovementInitiativeRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PE_DECISION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaGovernanceDecisionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PE_LESSON_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaLessonRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PE_CYCLE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaImprovementCycleRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PE_ASSESSMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMaturityAssessmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: PE_ADOPTION_REVIEW_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAdoptionReviewRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: PE_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: PE_PERSON_DIRECTORY,
    useFactory: (people: PersonService) => new PersonServiceDirectory(people),
    inject: [PERSON_SERVICE],
  },
  {
    provide: PE_EVIDENCE_DIRECTORY,
    useFactory: (
      attention: AttentionItemService,
      evaluations: EvaluationService,
      forecastRuns: ForecastRunService,
      decisions: DecisionService,
      assertions: AssertionService,
      entities: KnowledgeEntityService,
    ) =>
      new PlatformEvidenceRecordDirectory(
        attention,
        evaluations,
        forecastRuns,
        decisions,
        assertions,
        entities,
      ),
    inject: [
      EI_ATTENTION_ITEM_SERVICE,
      AE_EVALUATION_SERVICE,
      PI_FORECAST_RUN_SERVICE,
      DI_DECISION_SERVICE,
      KG_ASSERTION_SERVICE,
      KG_ENTITY_SERVICE,
    ],
  },
  {
    provide: PE_MEMORY_DIRECTORY,
    useFactory: (entities: KnowledgeEntityService, memories: KnowledgeMemoryService) =>
      new KnowledgeGraphMemoryDirectory(entities, memories),
    inject: [KG_ENTITY_SERVICE, KG_MEMORY_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: PE_SIGNAL_SERVICE,
    useFactory: (
      repository: ImprovementSignalRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      evidence: EvidenceRecordDirectory,
      events: EventBus,
    ) => new ImprovementSignalService({ repository, organizations, people, evidence, events }),
    inject: [
      PE_SIGNAL_REPOSITORY,
      PE_ORGANIZATION_DIRECTORY,
      PE_PERSON_DIRECTORY,
      PE_EVIDENCE_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PE_INITIATIVE_SERVICE,
    useFactory: (
      repository: ImprovementInitiativeRepository,
      decisions: GovernanceDecisionRepository,
      signals: ImprovementSignalRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) =>
      new ImprovementInitiativeService({
        repository,
        decisions,
        signals,
        organizations,
        people,
        events,
      }),
    inject: [
      PE_INITIATIVE_REPOSITORY,
      PE_DECISION_REPOSITORY,
      PE_SIGNAL_REPOSITORY,
      PE_ORGANIZATION_DIRECTORY,
      PE_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PE_DECISION_SERVICE,
    useFactory: (
      repository: GovernanceDecisionRepository,
      initiatives: ImprovementInitiativeRepository,
      cycles: ImprovementCycleRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) =>
      new GovernanceDecisionService({
        repository,
        initiatives,
        cycles,
        organizations,
        people,
        events,
      }),
    inject: [
      PE_DECISION_REPOSITORY,
      PE_INITIATIVE_REPOSITORY,
      PE_CYCLE_REPOSITORY,
      PE_ORGANIZATION_DIRECTORY,
      PE_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PE_LESSON_SERVICE,
    useFactory: (
      repository: LessonRepository,
      memory: InstitutionalMemoryDirectory,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new LessonService({ repository, memory, organizations, people, events }),
    inject: [
      PE_LESSON_REPOSITORY,
      PE_MEMORY_DIRECTORY,
      PE_ORGANIZATION_DIRECTORY,
      PE_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PE_CYCLE_SERVICE,
    useFactory: (
      repository: ImprovementCycleRepository,
      decisions: GovernanceDecisionRepository,
      lessons: LessonRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) =>
      new ImprovementCycleService({
        repository,
        decisions,
        lessons,
        organizations,
        people,
        events,
      }),
    inject: [
      PE_CYCLE_REPOSITORY,
      PE_DECISION_REPOSITORY,
      PE_LESSON_REPOSITORY,
      PE_ORGANIZATION_DIRECTORY,
      PE_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: PE_ASSESSMENT_SERVICE,
    useFactory: (
      repository: MaturityAssessmentRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new MaturityAssessmentService({ repository, organizations, people, events }),
    inject: [PE_ASSESSMENT_REPOSITORY, PE_ORGANIZATION_DIRECTORY, PE_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: PE_ADOPTION_REVIEW_SERVICE,
    useFactory: (
      repository: AdoptionReviewRepository,
      initiatives: ImprovementInitiativeRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new AdoptionReviewService({ repository, initiatives, organizations, people, events }),
    inject: [
      PE_ADOPTION_REVIEW_REPOSITORY,
      PE_INITIATIVE_REPOSITORY,
      PE_ORGANIZATION_DIRECTORY,
      PE_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
];

/**
 * Platform Evolution, Institutional Learning & Continuous Improvement (P2-D30) — the thirtieth contract, the
 * sixth of Program E, and the last of Phase 2. Twenty-nine contracts model an institution *operating*; this one
 * models it *changing*, which is the activity all of them quietly depend on and none of them owns.
 *
 * Follows the domain architecture pattern (ADR-0010): the pure `@knowget/platform-evolution` package (seven
 * aggregates over the intake, lifecycle, governance, learning, cadence, maturity, realization and lineage
 * engines) behind repository ports, Prisma/RLS adapters, application services on the platform event bus, and
 * permission-gated, tenant-scoped REST controllers.
 *
 * The contract's rule — lessons feed institutional memory, and evolution always requires human governance — is
 * held by the aggregates, but this wiring is what decides who may perform each part of it, and two of the five
 * scopes are shaped by that rule rather than by convenience. `evolution:contribute` is deliberately the widest
 * write scope and deliberately the cheapest act: raising a signal, corroborating one and recording a lesson
 * commit the institution to nothing except having heard something, and a scope narrow enough to grant to
 * everyone is what makes the improvement queue real rather than a management artifact. `evolution:govern` is
 * deliberately the narrowest and covers the four moments where an answer becomes binding — a gate convened, a
 * ballot cast, an initiative approved or adopted, a cycle closed. Between them `evolution:manage` carries the
 * scheduling and disposal acts that cost something, and `evolution:assess` stands alone because scoring an
 * institution's own maturity is separable from running its improvement process: the people who own the areas
 * being scored are exactly the people whose scores would flatter them.
 *
 * The identities that gate decisions are never taken from a request body. The person raising a signal, the
 * holder of a corroborating account and above all the decider on a ballot come from the authenticated principal,
 * because every one of those is counted — persistence in distinct voices, quorum in distinct deciders — and a
 * body-supplied name would let a single caller manufacture a consensus the person directory could not detect,
 * since the colleagues being named are real.
 *
 * Four cross-domain reads enter through injected directory ports and never through package imports. Organization
 * and person existence are the usual node checks (P2-D01-M01, P2-D03). The evidence directory resolves a
 * citation by kind through Executive Intelligence (P2-D29), Assessment & Evaluation (P2-D10), Predictive
 * Intelligence (P2-D28), Decision Intelligence (P2-D27) and the graph's own assertions (P2-D25), and through the
 * knowledge graph by source pair for everything else — which is what stops a strongly held opinion from
 * acquiring a footnote. The memory directory is the one the contract's first clause turns on: a lesson becomes
 * `retained` only when a commitment resolves against the institutional knowledge graph (P2-D25), so retention is
 * reported here rather than granted, and a retrospective that produced twelve insights and committed none of
 * them reads as twelve unfinished records.
 *
 * Nothing on this surface enacts anything. An initiative reaches `adopted` and stops; a review recommends
 * reverting and stops; a maturity index is published and stops. There is no route that deploys, releases,
 * schedules or flags, because a platform able to enact its own conclusions is the single failure this contract
 * exists to make impossible.
 *
 * Exports every service token.
 */
@Module({
  imports: [
    OrganizationModule,
    PersonModule,
    KnowledgeGraphModule,
    AssessmentEvaluationModule,
    DecisionIntelligenceModule,
    PredictiveIntelligenceModule,
    ExecutiveIntelligenceModule,
  ],
  controllers: [
    ImprovementSignalController,
    ImprovementInitiativeController,
    GovernanceDecisionController,
    LessonController,
    ImprovementCycleController,
    MaturityAssessmentController,
    AdoptionReviewController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    PE_SIGNAL_SERVICE,
    PE_INITIATIVE_SERVICE,
    PE_DECISION_SERVICE,
    PE_LESSON_SERVICE,
    PE_CYCLE_SERVICE,
    PE_ASSESSMENT_SERVICE,
    PE_ADOPTION_REVIEW_SERVICE,
  ],
})
export class PlatformEvolutionModule {}
