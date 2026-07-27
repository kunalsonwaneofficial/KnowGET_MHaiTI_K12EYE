import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type CreateAgentDefinitionParams,
  activateAgent,
  createAgentDefinition,
  describeAgent,
  grantCapability,
  hasCapability,
  isAgentInvocable,
  retireAgent,
  revokeCapability,
  setAgentAutonomy,
  suspendAgent,
  toAgentView,
} from "./agent";
import { authorizeInvocation } from "./authorization";
import {
  CapabilityAlreadyGrantedError,
  CapabilityNotGrantedError,
  EmptyAgentKeyError,
  EmptyAgentNameError,
  InvalidAgentTransitionError,
} from "./errors";
import { activateTool, createToolDefinition, toToolView } from "./tool";

const base: CreateAgentDefinitionParams = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  key: "  Attendance.Monitor ",
  name: "  Attendance monitor  ",
  autonomyLevel: "supervised",
  purpose: "  Watches attendance and flags absences.  ",
};

const readCapability = activateTool(
  createToolDefinition({
    tenantId: "t1" as TenantId,
    organizationId: "org1" as Uuid,
    key: "attendance.read",
    name: "Read attendance",
    capabilityDomain: "attendance",
    effect: "read",
    riskLevel: "low",
    reversibility: "reversible",
  }),
);

describe("AgentDefinition — the registry entry", () => {
  it("normalizes the key, trims text, and starts drafted with no reach at all", () => {
    const agent = createAgentDefinition(base);
    expect(agent.key).toBe("attendance.monitor");
    expect(agent.name).toBe("Attendance monitor");
    expect(agent.purpose).toBe("Watches attendance and flags absences.");
    expect(agent.status).toBe("draft");
    expect(agent.grantedCapabilityKeys).toEqual([]);
    expect(isAgentInvocable(agent)).toBe(false);
  });

  it("requires a key and a name", () => {
    expect(() => createAgentDefinition({ ...base, key: "  " })).toThrow(EmptyAgentKeyError);
    expect(() => createAgentDefinition({ ...base, name: " " })).toThrow(EmptyAgentNameError);
  });

  it("records the autonomy it was registered with", () => {
    expect(createAgentDefinition({ ...base, autonomyLevel: "advisory" }).autonomyLevel).toBe(
      "advisory",
    );
  });
});

describe("describeAgent / setAgentAutonomy", () => {
  it("renames, restates the purpose, and clears it when given nothing", () => {
    const agent = createAgentDefinition(base);
    const renamed = describeAgent(agent, { name: " Register watcher ", purpose: "  " });
    expect(renamed.name).toBe("Register watcher");
    expect(renamed.purpose).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(() => describeAgent(createAgentDefinition(base), { name: "   " })).toThrow(
      EmptyAgentNameError,
    );
  });

  it("moves autonomy in both directions while the agent is live", () => {
    const active = activateAgent(createAgentDefinition(base));
    expect(setAgentAutonomy(active, "bounded").autonomyLevel).toBe("bounded");
    expect(setAgentAutonomy(active, "advisory").autonomyLevel).toBe("advisory");
  });

  it("refuses to reconfigure a retired agent", () => {
    const retired = retireAgent(createAgentDefinition(base));
    expect(() => describeAgent(retired, { name: "x" })).toThrow(InvalidAgentTransitionError);
    expect(() => setAgentAutonomy(retired, "bounded")).toThrow(InvalidAgentTransitionError);
  });
});

describe("the agent lifecycle — suspension is the emergency stop", () => {
  it("goes draft → active → suspended → active", () => {
    const draft = createAgentDefinition(base);
    const active = activateAgent(draft);
    expect(active.status).toBe("active");
    expect(isAgentInvocable(active)).toBe(true);

    const suspended = suspendAgent(active);
    expect(suspended.status).toBe("suspended");
    expect(isAgentInvocable(suspended)).toBe(false);

    expect(activateAgent(suspended).status).toBe("active");
  });

  it("stops a suspended agent at the gate without unpicking a single grant", () => {
    const granted = grantCapability(activateAgent(createAgentDefinition(base)), "attendance.read");
    const view = toToolView(readCapability);
    expect(authorizeInvocation(toAgentView(granted), view).outcome).toBe("allowed");

    const suspended = suspendAgent(granted);
    expect(suspended.grantedCapabilityKeys).toEqual(["attendance.read"]);
    const decision = authorizeInvocation(toAgentView(suspended), view);
    expect(decision.outcome).toBe("denied");
    expect(decision.reasons).toEqual(["agent_not_active"]);
  });

  it("retires from any state, once", () => {
    expect(retireAgent(createAgentDefinition(base)).status).toBe("retired");
    const retired = retireAgent(activateAgent(createAgentDefinition(base)));
    expect(retired.status).toBe("retired");
    expect(() => retireAgent(retired)).toThrow(InvalidAgentTransitionError);
  });

  it("refuses to activate an already-active agent or suspend one that is not active", () => {
    const active = activateAgent(createAgentDefinition(base));
    expect(() => activateAgent(active)).toThrow(InvalidAgentTransitionError);
    expect(() => suspendAgent(createAgentDefinition(base))).toThrow(InvalidAgentTransitionError);
  });
});

describe("capability grants — the whole of an agent's reach", () => {
  it("grants capability keys, normalized and sorted", () => {
    const agent = createAgentDefinition(base);
    const granted = grantCapability(grantCapability(agent, " Guardian.Notify "), "attendance.read");
    expect(granted.grantedCapabilityKeys).toEqual(["attendance.read", "guardian.notify"]);
    expect(hasCapability(granted, "GUARDIAN.NOTIFY")).toBe(true);
    expect(hasCapability(granted, "fees.waive")).toBe(false);
  });

  it("refuses to grant the same capability twice rather than absorbing it", () => {
    const granted = grantCapability(createAgentDefinition(base), "attendance.read");
    expect(() => grantCapability(granted, "Attendance.Read")).toThrow(
      CapabilityAlreadyGrantedError,
    );
  });

  it("revokes a grant while the agent is live, and the gate closes at the next decision", () => {
    const granted = grantCapability(activateAgent(createAgentDefinition(base)), "attendance.read");
    const revoked = revokeCapability(granted, "ATTENDANCE.READ");
    expect(revoked.grantedCapabilityKeys).toEqual([]);

    const decision = authorizeInvocation(toAgentView(revoked), toToolView(readCapability));
    expect(decision.outcome).toBe("denied");
    expect(decision.reasons).toEqual(["capability_not_granted"]);
  });

  it("refuses to revoke what was never granted", () => {
    expect(() => revokeCapability(createAgentDefinition(base), "fees.waive")).toThrow(
      CapabilityNotGrantedError,
    );
  });

  it("refuses an empty capability key", () => {
    expect(() => grantCapability(createAgentDefinition(base), "   ")).toThrow(
      CapabilityNotGrantedError,
    );
  });

  it("refuses to change the grants of a retired agent", () => {
    const retired = retireAgent(grantCapability(createAgentDefinition(base), "attendance.read"));
    expect(() => grantCapability(retired, "fees.waive")).toThrow(InvalidAgentTransitionError);
    expect(() => revokeCapability(retired, "attendance.read")).toThrow(InvalidAgentTransitionError);
  });
});

describe("toAgentView", () => {
  it("gives the authorization engine exactly what it reads", () => {
    const agent = grantCapability(
      activateAgent(createAgentDefinition({ ...base, autonomyLevel: "bounded" })),
      "attendance.read",
    );
    expect(toAgentView(agent)).toEqual({
      id: agent.id,
      status: "active",
      autonomyLevel: "bounded",
      grantedCapabilityKeys: ["attendance.read"],
    });
  });
});
