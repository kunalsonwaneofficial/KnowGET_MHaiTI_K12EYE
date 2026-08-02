import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { DeadLetterController } from "./dead-letter.controller";
import { EventMeshModule } from "./event-mesh.module";
import {
  EM_BINDING_SERVICE,
  EM_CHECKPOINT_SERVICE,
  EM_DEAD_LETTER_SERVICE,
  EM_EVENT_TYPE_SERVICE,
  EM_MESSAGE_SERVICE,
  EM_ORGANIZATION_DIRECTORY,
  EM_PERSON_DIRECTORY,
  EM_REPLAY_SERVICE,
  EM_STREAM_SERVICE,
  EM_SUBSCRIPTION_SERVICE,
  EM_TRANSPORT_REGISTRY,
} from "./event-mesh.tokens";
import { EventStreamController } from "./event-stream.controller";
import { EventTypeDefinitionController } from "./event-type-definition.controller";
import { MeshMessageController } from "./mesh-message.controller";
import { MeshSubscriptionController } from "./mesh-subscription.controller";
import { ReplayRequestController } from "./replay-request.controller";
import { StreamBindingController } from "./stream-binding.controller";
import { SubscriptionCheckpointController } from "./subscription-checkpoint.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * event mesh DI graph — including the imported Organization and Person modules — compiles without a live
 * database. The Prisma adapters only store the handle at construction.
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

describe("EventMeshModule (integration)", () => {
  it("compiles the full vocabulary, arrangement and traffic DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, EventMeshModule],
    }).compile();

    expect(moduleRef.get(EventTypeDefinitionController)).toBeInstanceOf(
      EventTypeDefinitionController,
    );
    expect(moduleRef.get(EventStreamController)).toBeInstanceOf(EventStreamController);
    expect(moduleRef.get(StreamBindingController)).toBeInstanceOf(StreamBindingController);
    expect(moduleRef.get(MeshSubscriptionController)).toBeInstanceOf(MeshSubscriptionController);
    expect(moduleRef.get(MeshMessageController)).toBeInstanceOf(MeshMessageController);
    expect(moduleRef.get(SubscriptionCheckpointController)).toBeInstanceOf(
      SubscriptionCheckpointController,
    );
    expect(moduleRef.get(DeadLetterController)).toBeInstanceOf(DeadLetterController);
    expect(moduleRef.get(ReplayRequestController)).toBeInstanceOf(ReplayRequestController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, EventMeshModule],
    }).compile();

    for (const token of [
      EM_EVENT_TYPE_SERVICE,
      EM_STREAM_SERVICE,
      EM_BINDING_SERVICE,
      EM_SUBSCRIPTION_SERVICE,
      EM_MESSAGE_SERVICE,
      EM_CHECKPOINT_SERVICE,
      EM_DEAD_LETTER_SERVICE,
      EM_REPLAY_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });

  /**
   * Three ports, and each carries a rule the package states but cannot enforce alone. The organization directory
   * is what makes the institution on an event type, a stream, a binding and a subscription a node that exists —
   * checked once at those four points and inherited everywhere afterwards, so a silent bind failure would put a
   * whole tree of traffic under an identifier resolving to nothing. The person directory is what makes eight
   * attributions name somebody real, on records that outlive the incidents they document. The transport registry
   * is what stops a binding naming a backbone this build cannot speak: unbound, every binding would activate and
   * every stream would look live while nothing left the process — the one failure here that looks like success.
   */
  it("binds the organization, person and transport ports", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, EventMeshModule],
    }).compile();

    for (const token of [EM_ORGANIZATION_DIRECTORY, EM_PERSON_DIRECTORY, EM_TRANSPORT_REGISTRY]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
