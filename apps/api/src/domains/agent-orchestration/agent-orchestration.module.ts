import {
  AgentService,
  type AgentRepository,
  ApprovalService,
  type ApprovalRequestRepository,
  ExecutionPlanService,
  type ExecutionPlanRepository,
  InvocationService,
  type OrganizationDirectory,
  OperationsService,
  ReasoningService,
  type ReasoningSessionRepository,
  ToolService,
  type ToolInvocationRepository,
  type ToolRepository,
} from "@knowget/agent-orchestration";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import {
  AI_AGENT_REPOSITORY,
  AI_AGENT_SERVICE,
  AI_APPROVAL_REPOSITORY,
  AI_APPROVAL_SERVICE,
  AI_INVOCATION_REPOSITORY,
  AI_INVOCATION_SERVICE,
  AI_OPERATIONS_SERVICE,
  AI_ORGANIZATION_DIRECTORY,
  AI_PLAN_REPOSITORY,
  AI_PLAN_SERVICE,
  AI_REASONING_SERVICE,
  AI_SESSION_REPOSITORY,
  AI_TOOL_REPOSITORY,
  AI_TOOL_SERVICE,
} from "./agent-orchestration.tokens";
import { AgentController } from "./agent.controller";
import { ApprovalController } from "./approval.controller";
import { CapabilityController } from "./capability.controller";
import { OrganizationServiceDirectory } from "./directory.adapters";
import { ExecutionPlanController } from "./execution-plan.controller";
import { InvocationController } from "./invocation.controller";
import { OperationsController } from "./operations.controller";
import { PrismaAgentRepository } from "./prisma-agent.repository";
import { PrismaApprovalRequestRepository } from "./prisma-approval-request.repository";
import { PrismaExecutionPlanRepository } from "./prisma-execution-plan.repository";
import { PrismaReasoningSessionRepository } from "./prisma-reasoning-session.repository";
import { PrismaToolInvocationRepository } from "./prisma-tool-invocation.repository";
import { PrismaToolRepository } from "./prisma-tool.repository";
import { ReasoningController } from "./reasoning.controller";

const repositories: Provider[] = [
  {
    provide: AI_AGENT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAgentRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AI_TOOL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaToolRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AI_PLAN_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaExecutionPlanRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AI_APPROVAL_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaApprovalRequestRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AI_INVOCATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaToolInvocationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: AI_SESSION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaReasoningSessionRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: AI_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: AI_AGENT_SERVICE,
    useFactory: (
      repository: AgentRepository,
      capabilities: ToolRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AgentService({ repository, capabilities, organizations, events }),
    inject: [AI_AGENT_REPOSITORY, AI_TOOL_REPOSITORY, AI_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AI_TOOL_SERVICE,
    useFactory: (
      repository: ToolRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new ToolService({ repository, organizations, events }),
    inject: [AI_TOOL_REPOSITORY, AI_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: AI_APPROVAL_SERVICE,
    useFactory: (repository: ApprovalRequestRepository, events: EventBus) =>
      new ApprovalService({ repository, events }),
    inject: [AI_APPROVAL_REPOSITORY, EVENT_BUS],
  },
  {
    provide: AI_PLAN_SERVICE,
    useFactory: (
      repository: ExecutionPlanRepository,
      agents: AgentRepository,
      capabilities: ToolRepository,
      approvals: ApprovalRequestRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) =>
      new ExecutionPlanService({
        repository,
        agents,
        capabilities,
        approvals,
        organizations,
        events,
      }),
    inject: [
      AI_PLAN_REPOSITORY,
      AI_AGENT_REPOSITORY,
      AI_TOOL_REPOSITORY,
      AI_APPROVAL_REPOSITORY,
      AI_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AI_INVOCATION_SERVICE,
    useFactory: (
      repository: ToolInvocationRepository,
      agents: AgentRepository,
      capabilities: ToolRepository,
      approvals: ApprovalRequestRepository,
      plans: ExecutionPlanRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) =>
      new InvocationService({
        repository,
        agents,
        capabilities,
        approvals,
        plans,
        organizations,
        events,
      }),
    inject: [
      AI_INVOCATION_REPOSITORY,
      AI_AGENT_REPOSITORY,
      AI_TOOL_REPOSITORY,
      AI_APPROVAL_REPOSITORY,
      AI_PLAN_REPOSITORY,
      AI_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AI_REASONING_SERVICE,
    useFactory: (
      repository: ReasoningSessionRepository,
      agents: AgentRepository,
      plans: ExecutionPlanRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new ReasoningService({ repository, agents, plans, organizations, events }),
    inject: [
      AI_SESSION_REPOSITORY,
      AI_AGENT_REPOSITORY,
      AI_PLAN_REPOSITORY,
      AI_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: AI_OPERATIONS_SERVICE,
    useFactory: (
      agents: AgentRepository,
      capabilities: ToolRepository,
      plans: ExecutionPlanRepository,
      invocations: ToolInvocationRepository,
      approvals: ApprovalRequestRepository,
    ) => new OperationsService({ agents, capabilities, plans, invocations, approvals }),
    inject: [
      AI_AGENT_REPOSITORY,
      AI_TOOL_REPOSITORY,
      AI_PLAN_REPOSITORY,
      AI_INVOCATION_REPOSITORY,
      AI_APPROVAL_REPOSITORY,
    ],
  },
];

/**
 * The Enterprise AI Operating System (P2-D26) — the runtime that lets an institution's agents act, and the
 * record of everything they did. The second contract of Program E, and the one that gives the knowledge graph
 * (P2-D25) something that reasons over it.
 *
 * Follows the domain architecture pattern (ADR-0010): the pure `@knowget/agent-orchestration` package (six
 * aggregates plus the authorization matrix, plan-inspection, rollback, reasoning-grounding and operations
 * engines) behind repository ports, Prisma/RLS adapters, application services on the platform event bus, and
 * permission-gated, tenant-scoped REST controllers. `agent:*` gates governance (which agents exist, how
 * autonomous each is, what the capability catalog holds); `ai:read` and `ai:operate` gate the runtime; and
 * `ai:approve` gates the human gate alone, so the person who runs a plan is not the person who clears it.
 *
 * Two contract rules are structural rather than documented. Agents invoke capabilities and never databases:
 * the catalog is the whole of an agent's reach and `InvocationService` is the only door to it, so there is no
 * code path from a plan to a table. And knowledge retrieval originates from the graph: a reasoning session
 * will not accept a retrieval that names no knowledge-graph reference, which makes ungrounded recall
 * unrecordable rather than merely discouraged.
 *
 * External AI providers are absent by design — the AI OS never calls one. Provider access arrives behind the
 * Phase-3 integration adapter (P3-D09), and this domain will reach it through a port like any other.
 * Organization (P2-D01-M01) existence enters through an injected directory port. Exports every service token.
 */
@Module({
  imports: [OrganizationModule],
  controllers: [
    AgentController,
    CapabilityController,
    ExecutionPlanController,
    ApprovalController,
    InvocationController,
    ReasoningController,
    OperationsController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    AI_AGENT_SERVICE,
    AI_TOOL_SERVICE,
    AI_PLAN_SERVICE,
    AI_APPROVAL_SERVICE,
    AI_INVOCATION_SERVICE,
    AI_REASONING_SERVICE,
    AI_OPERATIONS_SERVICE,
  ],
})
export class AgentOrchestrationModule {}
