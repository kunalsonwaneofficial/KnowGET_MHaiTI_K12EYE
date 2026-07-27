import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AssertionController } from "./assertion.controller";
import { EntityMemoryController } from "./entity-memory.controller";
import { EntityTypeController } from "./entity-type.controller";
import { KnowledgeEntityController } from "./knowledge-entity.controller";
import { KnowledgeGraphModule } from "./knowledge-graph.module";
import {
  KG_ASSERTION_SERVICE,
  KG_ENTITY_SERVICE,
  KG_ENTITY_TYPE_SERVICE,
  KG_MEMORY_SERVICE,
  KG_RELATIONSHIP_SERVICE,
  KG_RELATIONSHIP_TYPE_SERVICE,
} from "./knowledge-graph.tokens";
import { RelationshipTypeController } from "./relationship-type.controller";
import { SemanticRelationshipController } from "./semantic-relationship.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * knowledge-graph DI graph — including the imported Organization module — compiles without a live database.
 * The Prisma adapters only store the handle at construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("KnowledgeGraphModule (integration)", () => {
  it("compiles the full knowledge-graph DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, KnowledgeGraphModule],
    }).compile();

    expect(moduleRef.get(EntityTypeController)).toBeInstanceOf(EntityTypeController);
    expect(moduleRef.get(RelationshipTypeController)).toBeInstanceOf(RelationshipTypeController);
    expect(moduleRef.get(KnowledgeEntityController)).toBeInstanceOf(KnowledgeEntityController);
    expect(moduleRef.get(SemanticRelationshipController)).toBeInstanceOf(
      SemanticRelationshipController,
    );
    expect(moduleRef.get(AssertionController)).toBeInstanceOf(AssertionController);
    expect(moduleRef.get(EntityMemoryController)).toBeInstanceOf(EntityMemoryController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the memory spine) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, KnowledgeGraphModule],
    }).compile();

    for (const token of [
      KG_ENTITY_TYPE_SERVICE,
      KG_RELATIONSHIP_TYPE_SERVICE,
      KG_ENTITY_SERVICE,
      KG_RELATIONSHIP_SERVICE,
      KG_ASSERTION_SERVICE,
      KG_MEMORY_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
