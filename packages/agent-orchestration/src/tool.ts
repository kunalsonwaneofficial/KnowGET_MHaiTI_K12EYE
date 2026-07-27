import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type Reversibility,
  type RiskLevel,
  type ToolEffect,
  type ToolStatus,
  normalizeCapabilityKey,
} from "./ai-value";
import type { ToolView } from "./ai-view";
import {
  EmptyCapabilityDomainError,
  EmptyToolKeyError,
  EmptyToolNameError,
  InvalidCompensationError,
  InvalidToolTransitionError,
  SelfCompensationError,
} from "./errors";

/**
 * A catalogued capability — one entry in the tenant's capability catalog, and the **only** kind of thing an
 * agent can be granted or a plan step can name.
 *
 * This aggregate is where the contract's first rule becomes a data structure. A capability names the platform
 * capability domain it routes to (`attendance`, `fees`, `guardian`) and nothing else: there is no field here for
 * a table, a query, a statement or a connection, so "agents invoke capabilities, never databases directly" is
 * not a convention the runtime tries to honour — it is the only thing the catalog can express.
 *
 * The rest of the entry is what authorization needs to decide: what invoking it *does* (`effect`), what is at
 * stake (`riskLevel`), whether it can be taken back (`reversibility`, and for a `compensatable` one, the
 * capability that takes it back), and whether it always needs a human whatever the agent's autonomy
 * (`requiresApproval`). A capability runs `draft → active → deprecated`; only an `active` one can be invoked,
 * and a deprecated one stays in the catalog because the invocations that already happened refer to it.
 */
export interface ToolDefinition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The tenant-unique capability key. What grants, plan steps and invocations all refer to. */
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  /** The platform capability this routes to. Never a data-access target — that is the point. */
  readonly capabilityDomain: string;
  readonly effect: ToolEffect;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  /** The capability that undoes this one. Present exactly when `reversibility` is `compensatable`. */
  readonly compensationKey: string | null;
  /** True when a human must approve every invocation, however autonomous the agent. */
  readonly requiresApproval: boolean;
  readonly status: ToolStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateToolDefinitionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly name: string;
  readonly capabilityDomain: string;
  readonly effect: ToolEffect;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  readonly compensationKey?: string | null;
  readonly requiresApproval?: boolean;
  readonly description?: string | null;
}

/** How a capability's risk profile may be restated. */
export interface ReclassifyToolPatch {
  readonly effect?: ToolEffect;
  readonly riskLevel?: RiskLevel;
  readonly reversibility?: Reversibility;
  readonly compensationKey?: string | null;
  readonly requiresApproval?: boolean;
}

/**
 * Check the compensation declaration against the reversibility, and return the key to store. A `compensatable`
 * capability must name what undoes it; anything else must not, because there is nothing to undo (`reversible`)
 * or no undoing it (`irreversible`). A capability naming itself would be a rollback that repeats the action.
 */
function resolveCompensation(
  key: string,
  reversibility: Reversibility,
  compensationKey: string | null | undefined,
): string | null {
  const declared = compensationKey ? normalizeCapabilityKey(compensationKey) : null;
  if (reversibility === "compensatable") {
    if (declared === null) {
      throw new InvalidCompensationError(reversibility, null);
    }
    if (declared === key) {
      throw new SelfCompensationError(key);
    }
    return declared;
  }
  if (declared !== null) {
    throw new InvalidCompensationError(reversibility, declared);
  }
  return null;
}

/** Register a capability in the catalog (status `draft`). Keys are normalized; the invariants are checked here. */
export function createToolDefinition(params: CreateToolDefinitionParams): ToolDefinition {
  const key = normalizeCapabilityKey(params.key);
  if (key.length === 0) {
    throw new EmptyToolKeyError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyToolNameError();
  }
  const capabilityDomain = normalizeCapabilityKey(params.capabilityDomain);
  if (capabilityDomain.length === 0) {
    throw new EmptyCapabilityDomainError();
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    key,
    name,
    description: params.description?.trim() || null,
    capabilityDomain,
    effect: params.effect,
    riskLevel: params.riskLevel,
    reversibility: params.reversibility,
    compensationKey: resolveCompensation(key, params.reversibility, params.compensationKey),
    requiresApproval: params.requiresApproval ?? false,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (tool: ToolDefinition, patch: Partial<ToolDefinition>): ToolDefinition => ({
  ...tool,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the capability may still be reconfigured — before it is deprecated. */
const isConfigurable = (tool: ToolDefinition): boolean => tool.status !== "deprecated";

/** Rename or redescribe a capability; not allowed once deprecated. */
export function describeTool(
  tool: ToolDefinition,
  patch: { name?: string; description?: string | null },
): ToolDefinition {
  if (!isConfigurable(tool)) {
    throw new InvalidToolTransitionError(tool.status, "described");
  }
  const next: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0) {
      throw new EmptyToolNameError();
    }
    next.name = name;
  }
  if (patch.description !== undefined) {
    next.description = patch.description?.trim() || null;
  }
  return touch(tool, next);
}

/**
 * Restate a capability's risk profile. Allowed while the capability is live, because re-rating a capability is
 * exactly how governance tightens the runtime — and it takes effect immediately: the authorization engine reads
 * the current rating, so raising a capability to `critical` stops every unattended invocation of it from the
 * next decision onward. The compensation invariants are re-checked against the new reversibility.
 */
export function reclassifyTool(tool: ToolDefinition, patch: ReclassifyToolPatch): ToolDefinition {
  if (!isConfigurable(tool)) {
    throw new InvalidToolTransitionError(tool.status, "reclassified");
  }
  const reversibility = patch.reversibility ?? tool.reversibility;
  const compensationKey =
    patch.compensationKey !== undefined
      ? patch.compensationKey
      : reversibility === tool.reversibility
        ? tool.compensationKey
        : null;

  return touch(tool, {
    effect: patch.effect ?? tool.effect,
    riskLevel: patch.riskLevel ?? tool.riskLevel,
    reversibility,
    compensationKey: resolveCompensation(tool.key, reversibility, compensationKey),
    requiresApproval: patch.requiresApproval ?? tool.requiresApproval,
  });
}

/** Activate a draft capability (`draft → active`) — it becomes invocable. */
export function activateTool(tool: ToolDefinition): ToolDefinition {
  if (tool.status !== "draft") {
    throw new InvalidToolTransitionError(tool.status, "active");
  }
  return touch(tool, { status: "active" });
}

/**
 * Deprecate a capability (`draft`/`active → deprecated`, terminal). It stops being invocable but stays in the
 * catalog, because the plans and invocations that already named it still need to resolve.
 */
export function deprecateTool(tool: ToolDefinition): ToolDefinition {
  if (tool.status === "deprecated") {
    throw new InvalidToolTransitionError(tool.status, "deprecated");
  }
  return touch(tool, { status: "deprecated" });
}

/** Whether the capability can be invoked at all. */
export const isToolInvocable = (tool: ToolDefinition): boolean => tool.status === "active";

/** The narrow view the authorization and planning engines read. */
export const toToolView = (tool: ToolDefinition): ToolView => ({
  key: tool.key,
  status: tool.status,
  effect: tool.effect,
  riskLevel: tool.riskLevel,
  reversibility: tool.reversibility,
  requiresApproval: tool.requiresApproval,
  compensationKey: tool.compensationKey,
});
