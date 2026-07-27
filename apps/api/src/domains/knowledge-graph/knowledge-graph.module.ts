import {
  AssertionService,
  type AssertionRepository,
  EntityTypeService,
  type EntityTypeRepository,
  type EntityMemoryRepository,
  KnowledgeEntityService,
  type KnowledgeEntityRepository,
  KnowledgeMemoryService,
  type OrganizationDirectory,
  RelationshipTypeService,
  type RelationshipTypeRepository,
  SemanticRelationshipService,
  type SemanticRelationshipRepository,
} from "@knowget/knowledge-graph";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { AssertionController } from "./assertion.controller";
import { OrganizationServiceDirectory } from "./directory.adapters";
import { EntityMemoryController } from "./entity-memory.controller";
import { EntityTypeController } from "./entity-type.controller";
import { KnowledgeEntityController } from "./knowledge-entity.controller";
import {
  KG_ASSERTION_REPOSITORY,
  KG_ASSERTION_SERVICE,
  KG_ENTITY_REPOSITORY,
  KG_ENTITY_SERVICE,
  KG_ENTITY_TYPE_REPOSITORY,
  KG_ENTITY_TYPE_SERVICE,
  KG_MEMORY_REPOSITORY,
  KG_MEMORY_SERVICE,
  KG_ORGANIZATION_DIRECTORY,
  KG_RELATIONSHIP_REPOSITORY,
  KG_RELATIONSHIP_SERVICE,
  KG_RELATIONSHIP_TYPE_REPOSITORY,
  KG_RELATIONSHIP_TYPE_SERVICE,
} from "./knowledge-graph.tokens";
import { PrismaAssertionRepository } from "./prisma-assertion.repository";
import { PrismaEntityMemoryRepository } from "./prisma-entity-memory.repository";
import { PrismaEntityTypeRepository } from "./prisma-entity-type.repository";
import { PrismaKnowledgeEntityRepository } from "./prisma-knowledge-entity.repository";
import { PrismaRelationshipTypeRepository } from "./prisma-relationship-type.repository";
import { PrismaSemanticRelationshipRepository } from "./prisma-semantic-relationship.repository";
import { RelationshipTypeController } from "./relationship-type.controller";
import { SemanticRelationshipController } from "./semantic-relationship.controller";

const repositories: Provider[] = [
  {
    provide: KG_ENTITY_TYPE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEntityTypeRepository(db),
    inject: [DATABASE],
  },
  {
    provide: KG_RELATIONSHIP_TYPE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaRelationshipTypeRepository(db),
    inject: [DATABASE],
  },
  {
    provide: KG_ENTITY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaKnowledgeEntityRepository(db),
    inject: [DATABASE],
  },
  {
    provide: KG_RELATIONSHIP_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSemanticRelationshipRepository(db),
    inject: [DATABASE],
  },
  {
    provide: KG_ASSERTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAssertionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: KG_MEMORY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEntityMemoryRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: KG_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
];

const services: Provider[] = [
  {
    provide: KG_ENTITY_TYPE_SERVICE,
    useFactory: (
      repository: EntityTypeRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new EntityTypeService({ repository, organizations, events }),
    inject: [KG_ENTITY_TYPE_REPOSITORY, KG_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: KG_RELATIONSHIP_TYPE_SERVICE,
    useFactory: (
      repository: RelationshipTypeRepository,
      entityTypes: EntityTypeRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new RelationshipTypeService({ repository, entityTypes, organizations, events }),
    inject: [
      KG_RELATIONSHIP_TYPE_REPOSITORY,
      KG_ENTITY_TYPE_REPOSITORY,
      KG_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: KG_ENTITY_SERVICE,
    useFactory: (
      repository: KnowledgeEntityRepository,
      entityTypes: EntityTypeRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new KnowledgeEntityService({ repository, entityTypes, organizations, events }),
    inject: [KG_ENTITY_REPOSITORY, KG_ENTITY_TYPE_REPOSITORY, KG_ORGANIZATION_DIRECTORY, EVENT_BUS],
  },
  {
    provide: KG_RELATIONSHIP_SERVICE,
    useFactory: (
      repository: SemanticRelationshipRepository,
      entities: KnowledgeEntityRepository,
      relationshipTypes: RelationshipTypeRepository,
      events: EventBus,
    ) => new SemanticRelationshipService({ repository, entities, relationshipTypes, events }),
    inject: [
      KG_RELATIONSHIP_REPOSITORY,
      KG_ENTITY_REPOSITORY,
      KG_RELATIONSHIP_TYPE_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: KG_ASSERTION_SERVICE,
    useFactory: (
      repository: AssertionRepository,
      entities: KnowledgeEntityRepository,
      relationships: SemanticRelationshipRepository,
      organizations: OrganizationDirectory,
      events: EventBus,
    ) => new AssertionService({ repository, entities, relationships, organizations, events }),
    inject: [
      KG_ASSERTION_REPOSITORY,
      KG_ENTITY_REPOSITORY,
      KG_RELATIONSHIP_REPOSITORY,
      KG_ORGANIZATION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: KG_MEMORY_SERVICE,
    useFactory: (
      memories: EntityMemoryRepository,
      entities: KnowledgeEntityRepository,
      relationships: SemanticRelationshipRepository,
      assertions: AssertionRepository,
      events: EventBus,
    ) => new KnowledgeMemoryService({ memories, entities, relationships, assertions, events }),
    inject: [
      KG_MEMORY_REPOSITORY,
      KG_ENTITY_REPOSITORY,
      KG_RELATIONSHIP_REPOSITORY,
      KG_ASSERTION_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Institutional Knowledge Graph (P2-D25) — the semantic layer, and the first contract of Program E (the
 * intelligence core). Follows the domain architecture pattern (ADR-0010): the pure `@knowget/knowledge-graph`
 * package (six aggregates plus the temporal, traversal, provenance and metrics engines and the memory refresh
 * spine) behind repository ports, Prisma/RLS adapters, application services on the platform event bus, and
 * permission-gated, tenant-scoped REST controllers. `ontology:*` gates the schema surface (entity + relationship
 * types); `knowledge:*` gates the content surface (entities, semantic relationships, assertions, digital
 * memory). Its defining rule — every assertion carries an evidence chain and is explainable — lives in the
 * assertion aggregate and the provenance engine. Organization (P2-D01-M01) existence enters through an injected
 * directory port. LLMs, agents, vector embeddings and RAG are deferred to the later intelligence domains
 * (P2-D26+). Exports every service token.
 */
@Module({
  imports: [OrganizationModule],
  controllers: [
    EntityTypeController,
    RelationshipTypeController,
    KnowledgeEntityController,
    SemanticRelationshipController,
    AssertionController,
    EntityMemoryController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    KG_ENTITY_TYPE_SERVICE,
    KG_RELATIONSHIP_TYPE_SERVICE,
    KG_ENTITY_SERVICE,
    KG_RELATIONSHIP_SERVICE,
    KG_ASSERTION_SERVICE,
    KG_MEMORY_SERVICE,
  ],
})
export class KnowledgeGraphModule {}
