import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { ApiConsumerController } from "./api-consumer.controller";
import { ApiContractController } from "./api-contract.controller";
import { CapabilityRouteController } from "./capability-route.controller";
import { GatewayModule } from "./gateway.module";
import {
  GW_ADAPTER_REGISTRY,
  GW_CONSUMER_SERVICE,
  GW_CONTRACT_SERVICE,
  GW_DELIVERY_SERVICE,
  GW_ENDPOINT_SERVICE,
  GW_EVENT_TYPE_CATALOGUE,
  GW_IDEMPOTENCY_SERVICE,
  GW_ORGANIZATION_DIRECTORY,
  GW_PERSON_DIRECTORY,
  GW_POLICY_SERVICE,
  GW_ROUTE_SERVICE,
  GW_SCOPE_CATALOGUE,
  GW_SUBSCRIPTION_SERVICE,
  GW_TARGET_DIRECTORY,
} from "./gateway.tokens";
import { IdempotencyController } from "./idempotency.controller";
import { IntegrationEndpointController } from "./integration-endpoint.controller";
import { OutboundDeliveryController } from "./outbound-delivery.controller";
import { TrafficPolicyController } from "./traffic-policy.controller";
import { WebhookSubscriptionController } from "./webhook-subscription.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * gateway DI graph — including the imported Organization, Person, Roles and Agent Orchestration modules — compiles
 * without a live database. The Prisma adapters only store the handle at construction.
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

describe("GatewayModule (integration)", () => {
  it("compiles the full ingress, egress and idempotency DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, GatewayModule],
    }).compile();

    expect(moduleRef.get(ApiConsumerController)).toBeInstanceOf(ApiConsumerController);
    expect(moduleRef.get(ApiContractController)).toBeInstanceOf(ApiContractController);
    expect(moduleRef.get(CapabilityRouteController)).toBeInstanceOf(CapabilityRouteController);
    expect(moduleRef.get(TrafficPolicyController)).toBeInstanceOf(TrafficPolicyController);
    expect(moduleRef.get(IntegrationEndpointController)).toBeInstanceOf(
      IntegrationEndpointController,
    );
    expect(moduleRef.get(WebhookSubscriptionController)).toBeInstanceOf(
      WebhookSubscriptionController,
    );
    expect(moduleRef.get(OutboundDeliveryController)).toBeInstanceOf(OutboundDeliveryController);
    expect(moduleRef.get(IdempotencyController)).toBeInstanceOf(IdempotencyController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, GatewayModule],
    }).compile();

    for (const token of [
      GW_CONSUMER_SERVICE,
      GW_CONTRACT_SERVICE,
      GW_ROUTE_SERVICE,
      GW_POLICY_SERVICE,
      GW_ENDPOINT_SERVICE,
      GW_SUBSCRIPTION_SERVICE,
      GW_DELIVERY_SERVICE,
      GW_IDEMPOTENCY_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });

  /**
   * The six ports are why this module imports four domains, and four of them carry a rule of the contract rather
   * than a convenience. The scope catalogue is what makes a route's required permission a name the platform
   * actually defines, and a consumer's grant a subset of it; the capability target directory is what makes an
   * external address resolve to something the platform knows how to invoke; the adapter registry is what stops an
   * endpoint naming a transport this build does not carry; the event-type catalogue is what keeps a subscription
   * to the curated set the institution is willing to promise. A port that silently failed to bind would turn
   * "the scope exists", "the target is invocable", "the adapter is built" and "the event is published" into
   * claims nothing checked, while every guard in the package still appeared to pass.
   */
  it("binds the organization, person, scope, target, adapter and event-type ports", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, GatewayModule],
    }).compile();

    for (const token of [
      GW_ORGANIZATION_DIRECTORY,
      GW_PERSON_DIRECTORY,
      GW_SCOPE_CATALOGUE,
      GW_TARGET_DIRECTORY,
      GW_ADAPTER_REGISTRY,
      GW_EVENT_TYPE_CATALOGUE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
