import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { AgentOrchestrationModule } from "./agent-orchestration.module";
import {
  AI_AGENT_SERVICE,
  AI_APPROVAL_SERVICE,
  AI_INVOCATION_SERVICE,
  AI_OPERATIONS_SERVICE,
  AI_PLAN_SERVICE,
  AI_REASONING_SERVICE,
  AI_TOOL_SERVICE,
} from "./agent-orchestration.tokens";
import { AgentController } from "./agent.controller";
import { ApprovalController } from "./approval.controller";
import { CapabilityController } from "./capability.controller";
import { ExecutionPlanController } from "./execution-plan.controller";
import { InvocationController } from "./invocation.controller";
import { OperationsController } from "./operations.controller";
import { ReasoningController } from "./reasoning.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so the
 * agent-orchestration DI graph — including the imported Organization module — compiles without a live database.
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

describe("AgentOrchestrationModule (integration)", () => {
  it("compiles the full AI operating system DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AgentOrchestrationModule],
    }).compile();

    expect(moduleRef.get(AgentController)).toBeInstanceOf(AgentController);
    expect(moduleRef.get(CapabilityController)).toBeInstanceOf(CapabilityController);
    expect(moduleRef.get(ExecutionPlanController)).toBeInstanceOf(ExecutionPlanController);
    expect(moduleRef.get(ApprovalController)).toBeInstanceOf(ApprovalController);
    expect(moduleRef.get(InvocationController)).toBeInstanceOf(InvocationController);
    expect(moduleRef.get(ReasoningController)).toBeInstanceOf(ReasoningController);
    expect(moduleRef.get(OperationsController)).toBeInstanceOf(OperationsController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service (and the operations view) for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, AgentOrchestrationModule],
    }).compile();

    for (const token of [
      AI_AGENT_SERVICE,
      AI_TOOL_SERVICE,
      AI_PLAN_SERVICE,
      AI_APPROVAL_SERVICE,
      AI_INVOCATION_SERVICE,
      AI_REASONING_SERVICE,
      AI_OPERATIONS_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
