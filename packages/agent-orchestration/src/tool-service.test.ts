import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { ToolService } from "./tool-service";
import {
  DuplicateToolError,
  InvalidCompensationError,
  InvalidToolTransitionError,
  OrganizationNotFoundForAgentError,
  SelfCompensationError,
  ToolNotFoundError,
  UnknownCapabilityError,
} from "./errors";
import { InMemoryToolRepository, type OrganizationDirectory } from "./ports";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;
const orgDir: OrganizationDirectory = {
  async exists(_tenantId, id) {
    return id === ORG;
  },
};

describe("ToolService", () => {
  let repository: InMemoryToolRepository;
  let published: DomainEvent[];
  let svc: ToolService;

  beforeEach(() => {
    repository = new InMemoryToolRepository();
    published = [];
    svc = new ToolService({
      repository,
      organizations: orgDir,
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const register = (key: string, overrides: Record<string, unknown> = {}) =>
    svc.register({
      tenantId: TENANT,
      organizationId: ORG,
      key,
      name: "Read attendance",
      capabilityDomain: "attendance",
      effect: "read",
      riskLevel: "low",
      reversibility: "reversible",
      ...overrides,
    });

  it("registers a capability drafted, so nothing can be pointed at it yet", async () => {
    const tool = await register("attendance.read");

    expect(tool.status).toBe("draft");
    expect(published.map((event) => event.type)).toEqual(["ai.capability.registered"]);
  });

  it("refuses a capability hung off an organization that does not exist", async () => {
    await expect(
      svc.register({
        tenantId: TENANT,
        organizationId: "org-9" as Uuid,
        key: "ghost.act",
        name: "Ghost",
        capabilityDomain: "ghost",
        effect: "read",
        riskLevel: "low",
        reversibility: "reversible",
      }),
    ).rejects.toThrow(OrganizationNotFoundForAgentError);
  });

  it("holds one entry per key per tenant", async () => {
    await register("attendance.read");
    await expect(register("attendance.read")).rejects.toThrow(DuplicateToolError);
  });

  /**
   * The referential half of the compensation rule. The aggregate already refuses a compensatable capability that
   * names no undo, and one that names itself; what it cannot know is whether the named undo exists. A rollback
   * reaching for a capability nobody registered fails mid-recovery — after the thing worth undoing has happened.
   */
  it("refuses a compensatable capability whose undo is not in the catalog", async () => {
    await expect(
      register("guardian.notify", {
        effect: "write",
        riskLevel: "high",
        reversibility: "compensatable",
        compensationKey: "guardian.retract",
      }),
    ).rejects.toThrow(UnknownCapabilityError);
  });

  it("accepts one whose undo is registered first", async () => {
    await register("guardian.retract", { effect: "write" });
    const tool = await register("guardian.notify", {
      effect: "write",
      riskLevel: "high",
      reversibility: "compensatable",
      compensationKey: "guardian.retract",
    });

    expect(tool.compensationKey).toBe("guardian.retract");
  });

  it("refuses a compensatable capability that names no undo, or names itself", async () => {
    await expect(
      register("guardian.notify", { effect: "write", reversibility: "compensatable" }),
    ).rejects.toThrow(InvalidCompensationError);

    await expect(
      register("guardian.notify", {
        effect: "write",
        reversibility: "compensatable",
        compensationKey: "guardian.notify",
      }),
    ).rejects.toThrow(SelfCompensationError);
  });

  /** Reclassification moves the gate for every agent already granted the key, so the undo is re-resolved. */
  it("re-resolves the undo when a capability is reclassified", async () => {
    const tool = await register("guardian.notify", { effect: "write" });

    await expect(
      svc.reclassify(TENANT, tool.id, {
        reversibility: "compensatable",
        compensationKey: "guardian.retract",
      }),
    ).rejects.toThrow(UnknownCapabilityError);

    await register("guardian.retract", { effect: "write" });
    const reclassified = await svc.reclassify(TENANT, tool.id, {
      riskLevel: "critical",
      reversibility: "compensatable",
      compensationKey: "guardian.retract",
    });

    expect(reclassified.riskLevel).toBe("critical");
    expect(published.at(-1)?.type).toBe("ai.capability.reclassified");
  });

  it("re-resolves the undo at activation too, since the catalog can move underneath it", async () => {
    await register("guardian.retract", { effect: "write" });
    const tool = await register("guardian.notify", {
      effect: "write",
      reversibility: "compensatable",
      compensationKey: "guardian.retract",
    });
    const undo = await svc.getByKey(TENANT, "guardian.retract");
    await svc.remove(TENANT, undo.id);

    await expect(svc.activate(TENANT, tool.id)).rejects.toThrow(UnknownCapabilityError);
    expect((await svc.get(TENANT, tool.id)).status).toBe("draft");
  });

  it("walks the lifecycle and announces each move", async () => {
    const tool = await register("attendance.read");
    expect((await svc.activate(TENANT, tool.id)).status).toBe("active");
    expect((await svc.deprecate(TENANT, tool.id)).status).toBe("deprecated");

    expect(published.map((event) => event.type)).toEqual([
      "ai.capability.registered",
      "ai.capability.activated",
      "ai.capability.deprecated",
    ]);
  });

  it("refuses a move the aggregate does not allow", async () => {
    const tool = await register("attendance.read");
    await svc.activate(TENANT, tool.id);
    await svc.deprecate(TENANT, tool.id);

    await expect(svc.activate(TENANT, tool.id)).rejects.toThrow(InvalidToolTransitionError);
  });

  it("restates wording without touching the risk profile", async () => {
    const tool = await register("attendance.read");
    const described = await svc.describe(TENANT, tool.id, {
      description: "Reads a class register",
    });

    expect(described.description).toBe("Reads a class register");
    expect(described.riskLevel).toBe("low");
    expect(published.at(-1)?.type).toBe("ai.capability.described");
  });

  it("resolves by key — the lookup every grant, plan step and invocation actually makes", async () => {
    const tool = await register("attendance.read");

    expect((await svc.getByKey(TENANT, "attendance.read")).id).toBe(tool.id);
    await expect(svc.getByKey(TENANT, "fees.charge")).rejects.toThrow(UnknownCapabilityError);
    await expect(svc.getByKey(OTHER, "attendance.read")).rejects.toThrow(UnknownCapabilityError);
  });

  it("does not answer for another tenant's catalog, on read or on write", async () => {
    const tool = await register("attendance.read");

    await expect(svc.get(OTHER, tool.id)).rejects.toThrow(ToolNotFoundError);
    await expect(svc.activate(OTHER, tool.id)).rejects.toThrow(ToolNotFoundError);
    await expect(svc.remove(OTHER, tool.id)).rejects.toThrow(ToolNotFoundError);
    expect(await svc.list(OTHER)).toEqual([]);
  });
});
