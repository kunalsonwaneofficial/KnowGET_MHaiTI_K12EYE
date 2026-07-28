import type { ReasoningService, ToolService } from "@knowget/agent-orchestration";
import type { PrismaService } from "@knowget/database";
import {
  AutomationRunService,
  type AutomationRuleRepository,
  type AutomationRunRepository,
  type CapabilityDirectory,
  AutomationService,
  DecisionOperationsService,
  type DecisionRecordRepository,
  DecisionService,
  type EvidenceSourceDirectory,
  type OrganizationDirectory,
  type RecommendationRepository,
  RecommendationService,
  type WorkflowInstanceRepository,
  type WorkflowRepository,
  WorkflowRunService,
  WorkflowService,
} from "@knowget/decision-intelligence";
import type { EventBus } from "@knowget/events";
import type {
  AssertionService,
  KnowledgeEntityService,
  SemanticRelationshipService,
} from "@knowget/knowledge-graph";
import type { OrganizationService } from "@knowget/organization";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AgentOrchestrationModule } from "../agent-orchestration/agent-orchestration.module";
import {
  AI_REASONING_SERVICE,
  AI_TOOL_SERVICE,
} from "../agent-orchestration/agent-orchestration.tokens";
import { KnowledgeGraphModule } from "../knowledge-graph/knowledge-graph.module";
import {
  KG_ASSERTION_SERVICE,
  KG_ENTITY_SERVICE,
  KG_RELATIONSHIP_SERVICE,
} from "../knowledge-graph/knowledge-graph.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { AutomationRunController } from "./automation-run.controller";
import { AutomationRuleController } from "./automation-rule.controller";
import { DecisionOperationsController } from "./decision-operations.controller";
import {
  DI_AUTOMATION_RUN_SERVICE,
  DI_AUTOMATION_SERVICE,
  DI_CAPABILITY_DIRECTORY,
  DI_DECISION_REPOSITORY,
  DI_DECISION_SERVICE,
  DI_EVIDENCE_SOURCE_DIRECTORY,
  DI_INSTANCE_REPOSITORY,
  DI_OPERATIONS_SERVICE,
  DI_ORGANIZATION_DIRECTORY,
  DI_RECOMMENDATION_REPOSITORY,
  DI_RECOMMENDATION_SERVICE,
  DI_RULE_REPOSITORY,
  DI_RUN_REPOSITORY,
  DI_WORKFLOW_REPOSITORY,
  DI_WORKFLOW_RUN_SERVICE,
  DI_WORKFLOW_SERVICE,
} from "./decision-intelligence.tokens";
import { DecisionController } from "./decision.controller";
import {
  OrganizationServiceDirectory,
  PlatformEvidenceSourceDirectory,
  ToolCatalogCapabilityDirectory,
} from "./directory.adapters";
import { PrismaAutomationRuleRepository } from "./prisma-automation-rule.repository";
import { PrismaAutomationRunRepository } from "./prisma-automation-run.repository";
import { PrismaDecisionRecordRepository } from "./prisma-decision-record.repository";
import { PrismaRecommendationRepository } from "./prisma-recommendation.repository";
import { PrismaWorkflowInstanceRepository } from "./prisma-workflow-instance.repository";
import { PrismaWorkflowRepository } from "./prisma-workflow.repository";
import { RecommendationController } from "./recommendation.controller";
import { WorkflowRunController } from "./workflow-run.controller";
import { WorkflowController } from "./workflow.controller";

const repositories: Provider[] = [
  {
    provide: DI_RECOMMENDATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRecommendationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: DI_DECISION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDecisionRecordRepository(db),
    inject: [DATABASE],
  },
  {
    provide: DI_WORKFLOW_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaWorkflowRepository(db),
    inject: [DATABASE],
  },
  {
    provide: DI_INSTANCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaWorkflowInstanceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: DI_RULE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAutomationRuleRepository(db),
    inject: [DATABASE],
  },
  {
    provide: DI_RUN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAutomationRunRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: DI_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: DI_CAPABILITY_DIRECTORY,
    useFactory: (tools: ToolService) => new ToolCatalogCapabilityDirectory(tools),
    inject: [AI_TOOL_SERVICE],
  },
  {
    provide: DI_EVIDENCE_SOURCE_DIRECTORY,
    useFactory: (
      entities: KnowledgeEntityService,
      relationships: SemanticRelationshipService,
      assertions: AssertionService,
      sessions: ReasoningService,
    ) => new PlatformEvidenceSourceDirectory(entities, relationships, assertions, sessions),
    inject: [
      KG_ENTITY_SERVICE,
      KG_RELATIONSHIP_SERVICE,
      KG_ASSERTION_SERVICE,
      AI_REASONING_SERVICE,
    ],
  },
];

const services: Provider[] = [
  {
    provide: DI_RECOMMENDATION_SERVICE,
    useFactory: (
      repository: RecommendationRepository,
      organizations: OrganizationDirectory,
      evidenceSources: EvidenceSourceDirectory,
      events: EventBus,
    ) => new RecommendationService({ repository, organizations, evidenceSources, events }),
    inject: [
      DI_RECOMMENDATION_REPOSITORY,
      DI_ORGANIZATION_DIRECTORY,
      DI_EVIDENCE_SOURCE_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: DI_DECISION_SERVICE,
    useFactory: (
      repository: DecisionRecordRepository,
      recommendations: RecommendationRepository,
      capabilities: CapabilityDirectory,
      events: EventBus,
    ) => new DecisionService({ repository, recommendations, capabilities, events }),
    inject: [
      DI_DECISION_REPOSITORY,
      DI_RECOMMENDATION_REPOSITORY,
      DI_CAPABILITY_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: DI_WORKFLOW_SERVICE,
    useFactory: (
      repository: WorkflowRepository,
      organizations: OrganizationDirectory,
      capabilities: CapabilityDirectory,
      events: EventBus,
    ) => new WorkflowService({ repository, organizations, capabilities, events }),
    inject: [DI_WORKFLOW_REPOSITORY, DI_ORGANIZATION_DIRECTORY, DI_CAPABILITY_DIRECTORY, EVENT_BUS],
  },
  {
    provide: DI_WORKFLOW_RUN_SERVICE,
    useFactory: (
      repository: WorkflowInstanceRepository,
      workflows: WorkflowRepository,
      capabilities: CapabilityDirectory,
      events: EventBus,
    ) => new WorkflowRunService({ repository, workflows, capabilities, events }),
    inject: [DI_INSTANCE_REPOSITORY, DI_WORKFLOW_REPOSITORY, DI_CAPABILITY_DIRECTORY, EVENT_BUS],
  },
  {
    provide: DI_AUTOMATION_SERVICE,
    useFactory: (
      repository: AutomationRuleRepository,
      organizations: OrganizationDirectory,
      capabilities: CapabilityDirectory,
      events: EventBus,
    ) => new AutomationService({ repository, organizations, capabilities, events }),
    inject: [DI_RULE_REPOSITORY, DI_ORGANIZATION_DIRECTORY, DI_CAPABILITY_DIRECTORY, EVENT_BUS],
  },
  {
    provide: DI_AUTOMATION_RUN_SERVICE,
    useFactory: (
      repository: AutomationRunRepository,
      rules: AutomationRuleRepository,
      recommendations: RecommendationRepository,
      capabilities: CapabilityDirectory,
      events: EventBus,
    ) => new AutomationRunService({ repository, rules, recommendations, capabilities, events }),
    inject: [
      DI_RUN_REPOSITORY,
      DI_RULE_REPOSITORY,
      DI_RECOMMENDATION_REPOSITORY,
      DI_CAPABILITY_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: DI_OPERATIONS_SERVICE,
    useFactory: (
      recommendations: RecommendationRepository,
      decisions: DecisionRecordRepository,
      workflows: WorkflowRepository,
      instances: WorkflowInstanceRepository,
      rules: AutomationRuleRepository,
      runs: AutomationRunRepository,
    ) =>
      new DecisionOperationsService({
        recommendations,
        decisions,
        workflows,
        instances,
        rules,
        runs,
      }),
    inject: [
      DI_RECOMMENDATION_REPOSITORY,
      DI_DECISION_REPOSITORY,
      DI_WORKFLOW_REPOSITORY,
      DI_INSTANCE_REPOSITORY,
      DI_RULE_REPOSITORY,
      DI_RUN_REPOSITORY,
    ],
  },
];

/**
 * Institutional Decision Intelligence, Workflow Orchestration & Autonomous Operations (P2-D27) — where the
 * platform stops describing the institution and starts proposing to it. The third contract of Program E, and the
 * one that gives the knowledge graph (P2-D25) and the AI runtime (P2-D26) somewhere for their conclusions to go.
 *
 * Follows the domain architecture pattern (ADR-0010): the pure `@knowget/decision-intelligence` package (six
 * aggregates over the autonomy, evidence, orchestration, reversal, prioritization and metrics engines) behind
 * repository ports, Prisma/RLS adapters, application services on the platform event bus, and permission-gated,
 * tenant-scoped REST controllers. `decision:manage` gates governance — what processes and standing rules an
 * institution allows itself; `decision:operate` gates the runtime that carries them out; `decision:decide` gates
 * the human answer alone; and `decision:read` gates the whole of it, deliberately wide, because automation an
 * institution cannot look at is automation it has not really decided to run.
 *
 * The contract's three rules are structural here rather than procedural. Only low-risk actions auto-execute: the
 * autonomy engine grades every firing against its action's risk and reversibility before anything is dispatched,
 * and `decision:decide` is a separate credential from `decision:operate` so the operator who fires a rule cannot
 * also clear the approval it stopped for. Recommendations ship with evidence chains: nothing can be raised
 * without one, every citation is checked to resolve through the evidence-source directory before it is written,
 * and a chain cannot be pruned below what still grounds the proposal. Automation carries rollback: reversibility
 * is declared at authoring time, a compensating capability is checked reachable before any reversal is recorded,
 * and what the institution has done and not yet undone is a first-class query rather than a report.
 *
 * Three cross-domain reads enter through injected directory ports and never through package imports:
 * organization existence (P2-D01-M01), capability invocability against the AI catalog (P2-D26) — re-checked at
 * every moment that arms something, because a draft can sit for weeks between being written and being turned on
 * — and evidence resolution against the knowledge graph and the reasoning record (P2-D25, P2-D26). Exports every
 * service token.
 */
@Module({
  imports: [OrganizationModule, KnowledgeGraphModule, AgentOrchestrationModule],
  controllers: [
    RecommendationController,
    DecisionController,
    WorkflowController,
    WorkflowRunController,
    AutomationRuleController,
    AutomationRunController,
    DecisionOperationsController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    DI_RECOMMENDATION_SERVICE,
    DI_DECISION_SERVICE,
    DI_WORKFLOW_SERVICE,
    DI_WORKFLOW_RUN_SERVICE,
    DI_AUTOMATION_SERVICE,
    DI_AUTOMATION_RUN_SERVICE,
    DI_OPERATIONS_SERVICE,
  ],
})
export class DecisionIntelligenceModule {}
