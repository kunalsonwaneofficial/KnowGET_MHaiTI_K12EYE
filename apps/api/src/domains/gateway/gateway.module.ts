import type { ToolService } from "@knowget/agent-orchestration";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import {
  type AdapterRegistry,
  type ApiConsumerRepository,
  ApiConsumerService,
  type ApiContractRepository,
  ApiContractService,
  type CapabilityRouteRepository,
  CapabilityRouteService,
  type CapabilityTargetDirectory,
  type EventTypeCatalogue,
  type IdempotencyRecordRepository,
  IdempotencyService,
  type IntegrationEndpointRepository,
  IntegrationEndpointService,
  type OrganizationDirectory,
  type OutboundDeliveryRepository,
  OutboundDeliveryService,
  type PersonDirectory,
  type ScopeCatalogue,
  type TrafficPolicyRepository,
  TrafficPolicyService,
  type WebhookSubscriptionRepository,
  WebhookSubscriptionService,
} from "@knowget/gateway";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import type { RoleService } from "@knowget/roles";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AgentOrchestrationModule } from "../agent-orchestration/agent-orchestration.module";
import { AI_TOOL_SERVICE } from "../agent-orchestration/agent-orchestration.tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { RolesModule } from "../roles/roles.module";
import { ROLE_SERVICE } from "../roles/roles.tokens";
import { ApiConsumerController } from "./api-consumer.controller";
import { ApiContractController } from "./api-contract.controller";
import { CapabilityRouteController } from "./capability-route.controller";
import {
  DeclaredAdapterRegistry,
  OrganizationServiceDirectory,
  PersonServiceDirectory,
  PublishedEventTypeCatalogue,
  RoleScopeCatalogue,
  ToolCatalogTargetDirectory,
} from "./directory.adapters";
import {
  GW_ADAPTER_REGISTRY,
  GW_CONSUMER_REPOSITORY,
  GW_CONSUMER_SERVICE,
  GW_CONTRACT_REPOSITORY,
  GW_CONTRACT_SERVICE,
  GW_DELIVERY_REPOSITORY,
  GW_DELIVERY_SERVICE,
  GW_ENDPOINT_REPOSITORY,
  GW_ENDPOINT_SERVICE,
  GW_EVENT_TYPE_CATALOGUE,
  GW_IDEMPOTENCY_REPOSITORY,
  GW_IDEMPOTENCY_SERVICE,
  GW_ORGANIZATION_DIRECTORY,
  GW_PERSON_DIRECTORY,
  GW_POLICY_REPOSITORY,
  GW_POLICY_SERVICE,
  GW_ROUTE_REPOSITORY,
  GW_ROUTE_SERVICE,
  GW_SCOPE_CATALOGUE,
  GW_SUBSCRIPTION_REPOSITORY,
  GW_SUBSCRIPTION_SERVICE,
  GW_TARGET_DIRECTORY,
} from "./gateway.tokens";
import { IdempotencyController } from "./idempotency.controller";
import { IntegrationEndpointController } from "./integration-endpoint.controller";
import { OutboundDeliveryController } from "./outbound-delivery.controller";
import { PrismaApiConsumerRepository } from "./prisma-api-consumer.repository";
import { PrismaApiContractRepository } from "./prisma-api-contract.repository";
import { PrismaCapabilityRouteRepository } from "./prisma-capability-route.repository";
import { PrismaIdempotencyRecordRepository } from "./prisma-idempotency-record.repository";
import { PrismaIntegrationEndpointRepository } from "./prisma-integration-endpoint.repository";
import { PrismaOutboundDeliveryRepository } from "./prisma-outbound-delivery.repository";
import { PrismaTrafficPolicyRepository } from "./prisma-traffic-policy.repository";
import { PrismaWebhookSubscriptionRepository } from "./prisma-webhook-subscription.repository";
import { TrafficPolicyController } from "./traffic-policy.controller";
import { WebhookSubscriptionController } from "./webhook-subscription.controller";

const repositories: Provider[] = [
  {
    provide: GW_CONSUMER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaApiConsumerRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GW_CONTRACT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaApiContractRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GW_ROUTE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaCapabilityRouteRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GW_POLICY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaTrafficPolicyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GW_ENDPOINT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaIntegrationEndpointRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GW_SUBSCRIPTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaWebhookSubscriptionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GW_DELIVERY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaOutboundDeliveryRepository(db),
    inject: [DATABASE],
  },
  {
    provide: GW_IDEMPOTENCY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaIdempotencyRecordRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: GW_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: GW_PERSON_DIRECTORY,
    useFactory: (people: PersonService) => new PersonServiceDirectory(people),
    inject: [PERSON_SERVICE],
  },
  {
    provide: GW_SCOPE_CATALOGUE,
    useFactory: (roles: RoleService) => new RoleScopeCatalogue(roles),
    inject: [ROLE_SERVICE],
  },
  {
    provide: GW_TARGET_DIRECTORY,
    useFactory: (tools: ToolService) => new ToolCatalogTargetDirectory(tools),
    inject: [AI_TOOL_SERVICE],
  },
  {
    provide: GW_ADAPTER_REGISTRY,
    useFactory: () => new DeclaredAdapterRegistry(),
  },
  {
    provide: GW_EVENT_TYPE_CATALOGUE,
    useFactory: () => new PublishedEventTypeCatalogue(),
  },
];

const services: Provider[] = [
  {
    provide: GW_CONSUMER_SERVICE,
    useFactory: (
      repository: ApiConsumerRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      scopes: ScopeCatalogue,
      events: EventBus,
    ) => new ApiConsumerService({ repository, organizations, people, scopes, events }),
    inject: [
      GW_CONSUMER_REPOSITORY,
      GW_ORGANIZATION_DIRECTORY,
      GW_PERSON_DIRECTORY,
      GW_SCOPE_CATALOGUE,
      EVENT_BUS,
    ],
  },
  {
    provide: GW_CONTRACT_SERVICE,
    useFactory: (
      repository: ApiContractRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new ApiContractService({ repository, organizations, people, events }),
    inject: [GW_CONTRACT_REPOSITORY, GW_ORGANIZATION_DIRECTORY, GW_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: GW_ROUTE_SERVICE,
    useFactory: (
      repository: CapabilityRouteRepository,
      contracts: ApiContractRepository,
      scopes: ScopeCatalogue,
      targets: CapabilityTargetDirectory,
      events: EventBus,
    ) => new CapabilityRouteService({ repository, contracts, scopes, targets, events }),
    inject: [
      GW_ROUTE_REPOSITORY,
      GW_CONTRACT_REPOSITORY,
      GW_SCOPE_CATALOGUE,
      GW_TARGET_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: GW_POLICY_SERVICE,
    useFactory: (
      repository: TrafficPolicyRepository,
      organizations: OrganizationDirectory,
      consumers: ApiConsumerRepository,
      events: EventBus,
    ) => new TrafficPolicyService({ repository, organizations, consumers, events }),
    inject: [GW_POLICY_REPOSITORY, GW_ORGANIZATION_DIRECTORY, GW_CONSUMER_REPOSITORY, EVENT_BUS],
  },
  {
    provide: GW_ENDPOINT_SERVICE,
    useFactory: (
      repository: IntegrationEndpointRepository,
      organizations: OrganizationDirectory,
      adapters: AdapterRegistry,
      events: EventBus,
    ) => new IntegrationEndpointService({ repository, organizations, adapters, events }),
    inject: [GW_ENDPOINT_REPOSITORY, GW_ORGANIZATION_DIRECTORY, GW_ADAPTER_REGISTRY, EVENT_BUS],
  },
  {
    provide: GW_SUBSCRIPTION_SERVICE,
    useFactory: (
      repository: WebhookSubscriptionRepository,
      consumers: ApiConsumerRepository,
      endpoints: IntegrationEndpointRepository,
      eventTypes: EventTypeCatalogue,
      events: EventBus,
    ) => new WebhookSubscriptionService({ repository, consumers, endpoints, eventTypes, events }),
    inject: [
      GW_SUBSCRIPTION_REPOSITORY,
      GW_CONSUMER_REPOSITORY,
      GW_ENDPOINT_REPOSITORY,
      GW_EVENT_TYPE_CATALOGUE,
      EVENT_BUS,
    ],
  },
  {
    provide: GW_DELIVERY_SERVICE,
    useFactory: (
      repository: OutboundDeliveryRepository,
      subscriptions: WebhookSubscriptionRepository,
      endpoints: IntegrationEndpointRepository,
      events: EventBus,
    ) => new OutboundDeliveryService({ repository, subscriptions, endpoints, events }),
    inject: [GW_DELIVERY_REPOSITORY, GW_SUBSCRIPTION_REPOSITORY, GW_ENDPOINT_REPOSITORY, EVENT_BUS],
  },
  {
    provide: GW_IDEMPOTENCY_SERVICE,
    useFactory: (repository: IdempotencyRecordRepository, events: EventBus) =>
      new IdempotencyService({ repository, events }),
    inject: [GW_IDEMPOTENCY_REPOSITORY, EVENT_BUS],
  },
];

/**
 * API Gateway & Integration Fabric (P3-D01) — the composition root for the platform's outward-facing edge.
 *
 * Eight aggregates, in two halves that meet in the middle. Ingress is a consumer holding credentials, a versioned
 * contract, the routes that give a contract public addresses, and the traffic policies that decide how much of it
 * anyone may use. Egress is an endpoint the platform may call, a subscription arranging for institutional facts to
 * be sent there, and the delivery records that say what was owed and how it went. The idempotency ledger sits
 * across both, because a guarded write is the one thing an ingress request and a redelivered event have in common.
 *
 * Six ports are bound here and every one of them is a read. Organizations and people are the usual node checks
 * (P2-D01-M01, P2-D03). The scope catalogue is backed by the roles register, so a route cannot demand a permission
 * the platform does not define and a consumer cannot be granted one — the fabric enforces scopes it does not own.
 * Capability targets resolve through the agent tool catalogue (P2-D26), which is the platform's existing register
 * of invocable capabilities, so an external address cannot be pointed at something nothing knows how to invoke.
 * The adapter registry and the published event-type catalogue are the two that are deliberately declarative rather
 * than discovered: the registry names the transports this build actually carries, and the catalogue names the
 * events the institution is willing to promise an outside system, which is a curated set and not an index of
 * everything the platform emits.
 *
 * Nothing in this module performs an external call, counts a request, retries an attempt or holds a secret.
 * Delivery mechanics belong to `@knowget/jobs`, rate-limit counting to `@knowget/security`, runtime retry, timeout
 * and circuit control to `@knowget/reliability`, the outbox to `@knowget/events`, and credential material to
 * whatever the `credentialRef` names — the fabric stores the reference and never the secret. What is here is the
 * arrangement: what the institution offers, to whom, on what terms, and what it owes them afterwards.
 *
 * Exports every service token, so the request pipeline can resolve a route and the delivery worker can find its
 * queue without either importing this domain's adapters.
 */
@Module({
  imports: [OrganizationModule, PersonModule, RolesModule, AgentOrchestrationModule],
  controllers: [
    ApiConsumerController,
    ApiContractController,
    CapabilityRouteController,
    TrafficPolicyController,
    IntegrationEndpointController,
    WebhookSubscriptionController,
    OutboundDeliveryController,
    IdempotencyController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    GW_CONSUMER_SERVICE,
    GW_CONTRACT_SERVICE,
    GW_ROUTE_SERVICE,
    GW_POLICY_SERVICE,
    GW_ENDPOINT_SERVICE,
    GW_SUBSCRIPTION_SERVICE,
    GW_DELIVERY_SERVICE,
    GW_IDEMPOTENCY_SERVICE,
  ],
})
export class GatewayModule {}
