import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AgentService } from "./agent-service";
import { ToolService } from "./tool-service";
import {
  AgentNotFoundError,
  CapabilityNotGrantedError,
  DuplicateAgentError,
  InvalidAgentTransitionError,
  OrganizationNotFoundForAgentError,
  UnknownCapabilityError,
} from "./errors";
import {
  InMemoryAgentRepository,
  InMemoryToolRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;
const orgDir: OrganizationDirectory = {
  async exists(_tenantId, id) {
    return id === ORG;
  },
};

describe("AgentService", () => {
  let agents: InMemoryAgentRepository;
  let capabilities: InMemoryToolRepository;
  let published: DomainEvent[];
  let svc: AgentService;
  let catalog: ToolService;

  beforeEach(async () => {
    agents = new InMemoryAgentRepository();
    capabilities = new InMemoryToolRepository();
    published = [];
    const events = {
      async publish(event: DomainEvent): Promise<void> {
        published.push(event);
      },
    };
    svc = new AgentService({ repository: agents, capabilities, organizations: orgDir, events });
    catalog = new ToolService({ repository: capabilities, organizations: orgDir });
    await catalog.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance.read",
      name: "Read attendance",
      capabilityDomain: "attendance",
      effect: "read",
      riskLevel: "low",
      reversibility: "reversible",
    });
  });

  const register = (key = "attendance-assistant") =>
    svc.register({
      tenantId: TENANT,
      organizationId: ORG,
      key,
      name: "Attendance assistant",
      autonomyLevel: "bounded",
    });

  it("registers an agent drafted, with no reach at all", async () => {
    const agent = await register();

    expect(agent.status).toBe("draft");
    expect(agent.grantedCapabilityKeys).toEqual([]);
    expect(published.map((event) => event.type)).toEqual(["ai.agent.registered"]);
  });

  it("refuses an agent hung off an organization that does not exist", async () => {
    await expect(
      svc.register({
        tenantId: TENANT,
        organizationId: "org-9" as Uuid,
        key: "ghost",
        name: "Ghost",
        autonomyLevel: "advisory",
      }),
    ).rejects.toThrow(OrganizationNotFoundForAgentError);
  });

  it("holds one agent per key per tenant, and lets another tenant use the same key", async () => {
    await register();
    await expect(register()).rejects.toThrow(DuplicateAgentError);

    const elsewhere = await svc.register({
      tenantId: OTHER,
      organizationId: ORG,
      key: "attendance-assistant",
      name: "Attendance assistant",
      autonomyLevel: "bounded",
    });
    expect(elsewhere.key).toBe("attendance-assistant");
  });

  /**
   * The rule this service exists for. A grant naming a key nothing answers to reads as real permission in an
   * audit while authorizing nothing — and starts authorizing something the day that name is registered.
   */
  it("refuses to grant a capability the catalog does not hold", async () => {
    const agent = await register();

    await expect(svc.grant(TENANT, agent.id, "fees.charge")).rejects.toThrow(
      UnknownCapabilityError,
    );
    expect((await svc.get(TENANT, agent.id)).grantedCapabilityKeys).toEqual([]);
  });

  it("grants a catalogued capability and announces the reach it just handed over", async () => {
    const agent = await register();
    const granted = await svc.grant(TENANT, agent.id, "attendance.read");

    expect(granted.grantedCapabilityKeys).toEqual(["attendance.read"]);
    const event = published.at(-1);
    expect(event?.type).toBe("ai.agent.capability_granted");
    expect((event?.payload as { capabilityKey: string }).capabilityKey).toBe("attendance.read");
  });

  it("normalizes the key on the way in, so one capability is not granted twice under two spellings", async () => {
    const agent = await register();
    const granted = await svc.grant(TENANT, agent.id, "  Attendance.Read  ");

    expect(granted.grantedCapabilityKeys).toEqual(["attendance.read"]);
  });

  /**
   * Revocation is deliberately not checked against the catalog: a grant naming a key that has since left the
   * catalog is exactly the grant most worth being able to take away.
   */
  it("withdraws a capability whose catalog entry has since gone", async () => {
    const agent = await register();
    await svc.grant(TENANT, agent.id, "attendance.read");
    const tool = await catalog.getByKey(TENANT, "attendance.read");
    await catalog.remove(TENANT, tool.id);

    const revoked = await svc.revoke(TENANT, agent.id, "attendance.read");
    expect(revoked.grantedCapabilityKeys).toEqual([]);
  });

  it("refuses to withdraw a capability that was never granted", async () => {
    const agent = await register();

    await expect(svc.revoke(TENANT, agent.id, "attendance.read")).rejects.toThrow(
      CapabilityNotGrantedError,
    );
  });

  it("walks the lifecycle and announces each move", async () => {
    const agent = await register();
    expect((await svc.activate(TENANT, agent.id)).status).toBe("active");
    expect((await svc.suspend(TENANT, agent.id)).status).toBe("suspended");
    expect((await svc.retire(TENANT, agent.id)).status).toBe("retired");

    expect(published.map((event) => event.type)).toEqual([
      "ai.agent.registered",
      "ai.agent.activated",
      "ai.agent.suspended",
      "ai.agent.retired",
    ]);
  });

  it("refuses a move the aggregate does not allow", async () => {
    const agent = await register();
    await svc.activate(TENANT, agent.id);
    await svc.retire(TENANT, agent.id);

    await expect(svc.activate(TENANT, agent.id)).rejects.toThrow(InvalidAgentTransitionError);
  });

  it("restates purpose and autonomy without touching reach", async () => {
    const agent = await register();
    await svc.grant(TENANT, agent.id, "attendance.read");

    const described = await svc.describe(TENANT, agent.id, { purpose: "Chase absences" });
    expect(described.purpose).toBe("Chase absences");

    const narrowed = await svc.setAutonomy(TENANT, agent.id, "advisory");
    expect(narrowed.autonomyLevel).toBe("advisory");
    expect(narrowed.grantedCapabilityKeys).toEqual(["attendance.read"]);
  });

  it("does not answer for another tenant's agent, on read or on write", async () => {
    const agent = await register();

    await expect(svc.get(OTHER, agent.id)).rejects.toThrow(AgentNotFoundError);
    await expect(svc.activate(OTHER, agent.id)).rejects.toThrow(AgentNotFoundError);
    await expect(svc.remove(OTHER, agent.id)).rejects.toThrow(AgentNotFoundError);
    expect(await svc.list(OTHER)).toEqual([]);
  });

  it("discards a draft and leaves nothing behind", async () => {
    const agent = await register();
    await svc.remove(TENANT, agent.id);

    expect(await svc.list(TENANT)).toEqual([]);
  });

  it("says nothing when nobody is listening", async () => {
    const quiet = new AgentService({
      repository: new InMemoryAgentRepository(),
      capabilities,
      organizations: orgDir,
    });

    const agent = await quiet.register({
      tenantId: TENANT,
      organizationId: ORG,
      key: "quiet",
      name: "Quiet",
      autonomyLevel: "advisory",
    });
    expect(agent.key).toBe("quiet");
    expect(published).toEqual([]);
  });
});
