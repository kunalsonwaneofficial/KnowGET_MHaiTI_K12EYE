import type { EvaluationService } from "@knowget/assessment-evaluation";
import type { PrismaService } from "@knowget/database";
import type { DecisionService } from "@knowget/decision-intelligence";
import type { EventBus } from "@knowget/events";
import {
  type AttentionItemRepository,
  AttentionItemService,
  type DashboardRepository,
  DashboardService,
  type EvidenceRecordDirectory,
  type ExecutiveBriefingRepository,
  ExecutiveBriefingService,
  type HealthIndexAssessmentRepository,
  HealthIndexAssessmentService,
  type HealthIndexDefinitionRepository,
  HealthIndexDefinitionService,
  type KpiDefinitionRepository,
  KpiDefinitionService,
  type KpiReadingRepository,
  KpiReadingService,
  type OrganizationDirectory,
} from "@knowget/executive-intelligence";
import type { AssertionService, KnowledgeEntityService } from "@knowget/knowledge-graph";
import type { OrganizationService } from "@knowget/organization";
import type { ForecastRunService } from "@knowget/predictive-intelligence";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AssessmentEvaluationModule } from "../assessment-evaluation/assessment-evaluation.module";
import { AE_EVALUATION_SERVICE } from "../assessment-evaluation/assessment-evaluation.tokens";
import { DecisionIntelligenceModule } from "../decision-intelligence/decision-intelligence.module";
import { DI_DECISION_SERVICE } from "../decision-intelligence/decision-intelligence.tokens";
import { KnowledgeGraphModule } from "../knowledge-graph/knowledge-graph.module";
import { KG_ASSERTION_SERVICE, KG_ENTITY_SERVICE } from "../knowledge-graph/knowledge-graph.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PredictiveIntelligenceModule } from "../predictive-intelligence/predictive-intelligence.module";
import { PI_FORECAST_RUN_SERVICE } from "../predictive-intelligence/predictive-intelligence.tokens";
import { AttentionItemController } from "./attention-item.controller";
import { DashboardController } from "./dashboard.controller";
import {
  OrganizationServiceDirectory,
  PlatformEvidenceRecordDirectory,
} from "./directory.adapters";
import { ExecutiveBriefingController } from "./executive-briefing.controller";
import {
  EI_ASSESSMENT_REPOSITORY,
  EI_ASSESSMENT_SERVICE,
  EI_ATTENTION_ITEM_REPOSITORY,
  EI_ATTENTION_ITEM_SERVICE,
  EI_BRIEFING_REPOSITORY,
  EI_BRIEFING_SERVICE,
  EI_DASHBOARD_REPOSITORY,
  EI_DASHBOARD_SERVICE,
  EI_EVIDENCE_DIRECTORY,
  EI_INDEX_DEFINITION_REPOSITORY,
  EI_INDEX_DEFINITION_SERVICE,
  EI_KPI_DEFINITION_REPOSITORY,
  EI_KPI_DEFINITION_SERVICE,
  EI_KPI_READING_REPOSITORY,
  EI_KPI_READING_SERVICE,
  EI_ORGANIZATION_DIRECTORY,
} from "./executive-intelligence.tokens";
import { HealthIndexAssessmentController } from "./health-index-assessment.controller";
import { HealthIndexDefinitionController } from "./health-index-definition.controller";
import { KpiDefinitionController } from "./kpi-definition.controller";
import { KpiReadingController } from "./kpi-reading.controller";
import { PrismaAttentionItemRepository } from "./prisma-attention-item.repository";
import { PrismaDashboardRepository } from "./prisma-dashboard.repository";
import { PrismaExecutiveBriefingRepository } from "./prisma-executive-briefing.repository";
import { PrismaHealthIndexAssessmentRepository } from "./prisma-health-index-assessment.repository";
import { PrismaHealthIndexDefinitionRepository } from "./prisma-health-index-definition.repository";
import { PrismaKpiDefinitionRepository } from "./prisma-kpi-definition.repository";
import { PrismaKpiReadingRepository } from "./prisma-kpi-reading.repository";

const repositories: Provider[] = [
  {
    provide: EI_KPI_DEFINITION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaKpiDefinitionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EI_KPI_READING_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaKpiReadingRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EI_INDEX_DEFINITION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaHealthIndexDefinitionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EI_ASSESSMENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaHealthIndexAssessmentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EI_DASHBOARD_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDashboardRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EI_BRIEFING_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaExecutiveBriefingRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EI_ATTENTION_ITEM_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAttentionItemRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: EI_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: EI_EVIDENCE_DIRECTORY,
    useFactory: (
      evaluations: EvaluationService,
      forecastRuns: ForecastRunService,
      decisions: DecisionService,
      assertions: AssertionService,
      entities: KnowledgeEntityService,
    ) =>
      new PlatformEvidenceRecordDirectory(
        evaluations,
        forecastRuns,
        decisions,
        assertions,
        entities,
      ),
    inject: [
      AE_EVALUATION_SERVICE,
      PI_FORECAST_RUN_SERVICE,
      DI_DECISION_SERVICE,
      KG_ASSERTION_SERVICE,
      KG_ENTITY_SERVICE,
    ],
  },
];

const services: Provider[] = [
  {
    provide: EI_KPI_DEFINITION_SERVICE,
    useFactory: (
      repository: KpiDefinitionRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new KpiDefinitionService({ repository, organizations, events }),
    inject: [EI_KPI_DEFINITION_REPOSITORY, EI_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EI_KPI_READING_SERVICE,
    useFactory: (
      repository: KpiReadingRepository,
      definitions: KpiDefinitionRepository,
      evidence: EvidenceRecordDirectory,
      events: EventBus,
    ) => new KpiReadingService({ repository, definitions, evidence, events }),
    inject: [
      EI_KPI_READING_REPOSITORY,
      EI_KPI_DEFINITION_REPOSITORY,
      EI_EVIDENCE_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EI_INDEX_DEFINITION_SERVICE,
    useFactory: (
      repository: HealthIndexDefinitionRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new HealthIndexDefinitionService({ repository, organizations, events }),
    inject: [EI_INDEX_DEFINITION_REPOSITORY, EI_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EI_ASSESSMENT_SERVICE,
    useFactory: (
      repository: HealthIndexAssessmentRepository,
      definitions: HealthIndexDefinitionRepository,
      kpis: KpiDefinitionRepository,
      readings: KpiReadingRepository,
      events: EventBus,
    ) => new HealthIndexAssessmentService({ repository, definitions, kpis, readings, events }),
    inject: [
      EI_ASSESSMENT_REPOSITORY,
      EI_INDEX_DEFINITION_REPOSITORY,
      EI_KPI_DEFINITION_REPOSITORY,
      EI_KPI_READING_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EI_DASHBOARD_SERVICE,
    useFactory: (
      repository: DashboardRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new DashboardService({ repository, organizations, events }),
    inject: [EI_DASHBOARD_REPOSITORY, EI_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EI_BRIEFING_SERVICE,
    useFactory: (
      repository: ExecutiveBriefingRepository,
      assessments: HealthIndexAssessmentRepository,
      events: EventBus,
    ) => new ExecutiveBriefingService({ repository, assessments, events }),
    inject: [EI_BRIEFING_REPOSITORY, EI_ASSESSMENT_REPOSITORY, EVENT_BUS],
  },
  {
    provide: EI_ATTENTION_ITEM_SERVICE,
    useFactory: (
      repository: AttentionItemRepository,
      assessments: HealthIndexAssessmentRepository,
      kpis: KpiDefinitionRepository,
      readings: KpiReadingRepository,
      events: EventBus,
    ) => new AttentionItemService({ repository, assessments, kpis, readings, events }),
    inject: [
      EI_ATTENTION_ITEM_REPOSITORY,
      EI_ASSESSMENT_REPOSITORY,
      EI_KPI_DEFINITION_REPOSITORY,
      EI_KPI_READING_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * Executive Intelligence, Governance & Institutional Command (P2-D29) — where twenty-eight contracts' worth of
 * institutional record becomes a figure leadership can be shown, and checked on. The fifth contract of Program E,
 * and the one that decides whether everything built beneath it can be answered for.
 *
 * Follows the domain architecture pattern (ADR-0010): the pure `@knowget/executive-intelligence` package (seven
 * aggregates over the measurement, banding, weighting, indexing, traceability, reproducibility, composition and
 * attention engines) behind repository ports, Prisma/RLS adapters, application services on the platform event bus,
 * and permission-gated, tenant-scoped REST controllers.
 *
 * The contract's three clauses are enforced by the aggregates rather than by this wiring, but the wiring is what
 * decides who may do each part of them. `command:manage` gates the questions an institution asks of itself —
 * indicator definitions, index compositions, and dashboard panel authorship, which belongs here rather than under
 * a viewing scope because the binding of a panel to a required scope *is* the role-awareness, and anyone able to
 * rebind panels could grant themselves any view by editing the page instead of being given access to it.
 * `command:measure` gates the figures beneath everything, and stands alone because a withdrawn reading
 * retroactively edits history a filed assessment consumed and an issued briefing pinned. `command:operate` gates
 * the runtime that computes, files and invalidates scores, and the queue that works their findings.
 * `command:brief` gates what the institution says under its own name, because computing a score and reporting one
 * to a board are different acts. And `command:read` is deliberately wide, including {@link
 * HealthIndexAssessmentController.verify}: an index nobody may reproduce fails this contract as surely as one
 * nobody may inspect.
 *
 * Two cross-domain reads enter through injected directory ports and never through package imports. Organization
 * existence is the usual node check (P2-D01-M01). The evidence directory is the one that matters: it is what makes
 * evidence-traceability true rather than declared, resolving a citation through Assessment & Evaluation (P2-D10),
 * Predictive Intelligence (P2-D28), Decision Intelligence (P2-D27) or the graph's own assertions (P2-D25) by kind,
 * and through the knowledge graph by source pair for everything else. A citation nobody can resolve is refused,
 * because a guard that passed the kinds it does not know would run on every reading and check almost none of them.
 *
 * Exports every service token.
 */
@Module({
  imports: [
    OrganizationModule,
    AssessmentEvaluationModule,
    KnowledgeGraphModule,
    DecisionIntelligenceModule,
    PredictiveIntelligenceModule,
  ],
  controllers: [
    KpiDefinitionController,
    KpiReadingController,
    HealthIndexDefinitionController,
    HealthIndexAssessmentController,
    DashboardController,
    ExecutiveBriefingController,
    AttentionItemController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    EI_KPI_DEFINITION_SERVICE,
    EI_KPI_READING_SERVICE,
    EI_INDEX_DEFINITION_SERVICE,
    EI_ASSESSMENT_SERVICE,
    EI_DASHBOARD_SERVICE,
    EI_BRIEFING_SERVICE,
    EI_ATTENTION_ITEM_SERVICE,
  ],
})
export class ExecutiveIntelligenceModule {}
