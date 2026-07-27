import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  EmptyCapabilityDomainError,
  EmptyToolKeyError,
  EmptyToolNameError,
  InvalidCompensationError,
  InvalidToolTransitionError,
  SelfCompensationError,
} from "./errors";
import {
  type CreateToolDefinitionParams,
  activateTool,
  createToolDefinition,
  deprecateTool,
  describeTool,
  isToolInvocable,
  reclassifyTool,
  toToolView,
} from "./tool";

const base: CreateToolDefinitionParams = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  key: "  Attendance.Read ",
  name: "  Read attendance  ",
  capabilityDomain: " Attendance ",
  effect: "read",
  riskLevel: "low",
  reversibility: "reversible",
};

const compensatable: CreateToolDefinitionParams = {
  ...base,
  key: "guardian.notify",
  name: "Notify a guardian",
  capabilityDomain: "guardian",
  effect: "write",
  riskLevel: "medium",
  reversibility: "compensatable",
  compensationKey: "Guardian.Notify.Retract",
};

describe("ToolDefinition — the capability catalog entry", () => {
  it("normalizes keys and trims text, and starts as a draft", () => {
    const capability = createToolDefinition(base);
    expect(capability.key).toBe("attendance.read");
    expect(capability.name).toBe("Read attendance");
    expect(capability.capabilityDomain).toBe("attendance");
    expect(capability.status).toBe("draft");
    expect(capability.requiresApproval).toBe(false);
    expect(capability.compensationKey).toBeNull();
    expect(isToolInvocable(capability)).toBe(false);
  });

  it("requires a key, a name and the platform capability it routes to", () => {
    expect(() => createToolDefinition({ ...base, key: "   " })).toThrow(EmptyToolKeyError);
    expect(() => createToolDefinition({ ...base, name: "  " })).toThrow(EmptyToolNameError);
    expect(() => createToolDefinition({ ...base, capabilityDomain: " " })).toThrow(
      EmptyCapabilityDomainError,
    );
  });

  it("normalizes the compensating capability of a compensatable entry", () => {
    expect(createToolDefinition(compensatable).compensationKey).toBe("guardian.notify.retract");
  });

  it("refuses a compensatable capability that does not say what undoes it", () => {
    expect(() => createToolDefinition({ ...compensatable, compensationKey: null })).toThrow(
      InvalidCompensationError,
    );
    expect(() => createToolDefinition({ ...compensatable, compensationKey: undefined })).toThrow(
      InvalidCompensationError,
    );
  });

  it("refuses a compensating capability on something there is no undoing", () => {
    expect(() =>
      createToolDefinition({
        ...base,
        reversibility: "irreversible",
        compensationKey: "attendance.unread",
      }),
    ).toThrow(InvalidCompensationError);
    expect(() => createToolDefinition({ ...base, compensationKey: "attendance.unread" })).toThrow(
      InvalidCompensationError,
    );
  });

  it("refuses a capability that claims to undo itself", () => {
    expect(() =>
      createToolDefinition({ ...compensatable, compensationKey: "guardian.notify" }),
    ).toThrow(SelfCompensationError);
  });

  it("carries the always-needs-a-human flag when asked", () => {
    const gated = createToolDefinition({ ...base, requiresApproval: true });
    expect(gated.requiresApproval).toBe(true);
  });
});

describe("describeTool", () => {
  it("renames and redescribes", () => {
    const renamed = describeTool(createToolDefinition(base), {
      name: " Read attendance registers ",
      description: "  Reads a class register.  ",
    });
    expect(renamed.name).toBe("Read attendance registers");
    expect(renamed.description).toBe("Reads a class register.");
  });

  it("rejects an empty name and refuses to touch a deprecated capability", () => {
    const capability = createToolDefinition(base);
    expect(() => describeTool(capability, { name: "  " })).toThrow(EmptyToolNameError);
    expect(() => describeTool(deprecateTool(capability), { name: "x" })).toThrow(
      InvalidToolTransitionError,
    );
  });
});

describe("reclassifyTool — re-rating a capability is how governance tightens the runtime", () => {
  it("raises the risk of a live capability, taking effect immediately", () => {
    const live = activateTool(createToolDefinition(base));
    const raised = reclassifyTool(live, { riskLevel: "critical", requiresApproval: true });
    expect(raised.riskLevel).toBe("critical");
    expect(raised.requiresApproval).toBe(true);
    expect(raised.status).toBe("active");
    expect(toToolView(raised).riskLevel).toBe("critical");
  });

  it("keeps the compensating capability when reversibility is unchanged", () => {
    const capability = createToolDefinition(compensatable);
    expect(reclassifyTool(capability, { riskLevel: "high" }).compensationKey).toBe(
      "guardian.notify.retract",
    );
  });

  it("drops the compensating capability when the entry stops being compensatable", () => {
    const capability = createToolDefinition(compensatable);
    const irreversible = reclassifyTool(capability, { reversibility: "irreversible" });
    expect(irreversible.compensationKey).toBeNull();
  });

  it("demands a compensating capability when an entry becomes compensatable", () => {
    const capability = createToolDefinition(base);
    expect(() => reclassifyTool(capability, { reversibility: "compensatable" })).toThrow(
      InvalidCompensationError,
    );
    expect(
      reclassifyTool(capability, {
        reversibility: "compensatable",
        compensationKey: "attendance.unread",
      }).compensationKey,
    ).toBe("attendance.unread");
  });

  it("refuses to re-rate a deprecated capability", () => {
    const gone = deprecateTool(createToolDefinition(base));
    expect(() => reclassifyTool(gone, { riskLevel: "high" })).toThrow(InvalidToolTransitionError);
  });
});

describe("the capability lifecycle", () => {
  it("goes draft → active → deprecated", () => {
    const draft = createToolDefinition(base);
    const active = activateTool(draft);
    expect(active.status).toBe("active");
    expect(isToolInvocable(active)).toBe(true);

    const gone = deprecateTool(active);
    expect(gone.status).toBe("deprecated");
    expect(isToolInvocable(gone)).toBe(false);
  });

  it("refuses to activate anything but a draft, or to deprecate twice", () => {
    const active = activateTool(createToolDefinition(base));
    expect(() => activateTool(active)).toThrow(InvalidToolTransitionError);
    const gone = deprecateTool(active);
    expect(() => deprecateTool(gone)).toThrow(InvalidToolTransitionError);
  });

  it("deprecates straight from draft — a capability that was never used still leaves the catalog", () => {
    expect(deprecateTool(createToolDefinition(base)).status).toBe("deprecated");
  });
});

describe("toToolView", () => {
  it("gives the engines exactly what they read, and nothing else", () => {
    const capability = activateTool(createToolDefinition(compensatable));
    expect(toToolView(capability)).toEqual({
      key: "guardian.notify",
      status: "active",
      effect: "write",
      riskLevel: "medium",
      reversibility: "compensatable",
      requiresApproval: false,
      compensationKey: "guardian.notify.retract",
    });
  });
});
