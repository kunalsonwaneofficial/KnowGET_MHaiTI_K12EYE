import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type AgentStatus,
  type AutonomyLevel,
  normalizeAgentKey,
  normalizeCapabilityKey,
} from "./ai-value";
import type { AgentView } from "./ai-view";
import {
  CapabilityAlreadyGrantedError,
  CapabilityNotGrantedError,
  EmptyAgentKeyError,
  EmptyAgentNameError,
  InvalidAgentTransitionError,
} from "./errors";

/**
 * A registered agent — an entry in the tenant's agent registry, and the subject of every authorization decision
 * the runtime makes.
 *
 * An agent is defined by three things: what it is *for* (`purpose`), how far it may go without a human
 * (`autonomyLevel`), and what it is allowed to reach (`grantedCapabilityKeys`). That last one is the whole of
 * its reach. An agent holds capability keys and nothing else — no connection, no credential, no data-access
 * scope — so an agent's power is exactly the list of capabilities an administrator granted it, and revoking a
 * key removes that power at the next decision.
 *
 * Agents are registered `draft`, activated when they are ready to be planned with, suspended when something is
 * wrong (reversibly), and retired when they are done (terminally). Only an `active` agent is ever authorized;
 * suspension is therefore the runtime's emergency stop, and it needs no other mechanism.
 */
export interface AgentDefinition {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The tenant-unique agent key. */
  readonly key: string;
  readonly name: string;
  /** What this agent exists to do, for the humans who govern it. */
  readonly purpose: string | null;
  readonly autonomyLevel: AutonomyLevel;
  readonly status: AgentStatus;
  /** The capability keys this agent may invoke — sorted, unique, and the entirety of its reach. */
  readonly grantedCapabilityKeys: readonly string[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAgentDefinitionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly name: string;
  readonly autonomyLevel: AutonomyLevel;
  readonly purpose?: string | null;
}

/**
 * Register an agent (status `draft`, granted nothing). Grants are never part of registration: an agent starts
 * with no reach at all and is given capabilities one at a time, each an explicit, auditable act.
 */
export function createAgentDefinition(params: CreateAgentDefinitionParams): AgentDefinition {
  const key = normalizeAgentKey(params.key);
  if (key.length === 0) {
    throw new EmptyAgentKeyError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyAgentNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    key,
    name,
    purpose: params.purpose?.trim() || null,
    autonomyLevel: params.autonomyLevel,
    status: "draft",
    grantedCapabilityKeys: [],
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (agent: AgentDefinition, patch: Partial<AgentDefinition>): AgentDefinition => ({
  ...agent,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the agent may still be configured — anything but retired. */
const isConfigurable = (agent: AgentDefinition): boolean => agent.status !== "retired";

/** Rename or restate an agent's purpose; not allowed once retired. */
export function describeAgent(
  agent: AgentDefinition,
  patch: { name?: string; purpose?: string | null },
): AgentDefinition {
  if (!isConfigurable(agent)) {
    throw new InvalidAgentTransitionError(agent.status, "described");
  }
  const next: { name?: string; purpose?: string | null } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0) {
      throw new EmptyAgentNameError();
    }
    next.name = name;
  }
  if (patch.purpose !== undefined) {
    next.purpose = patch.purpose?.trim() || null;
  }
  return touch(agent, next);
}

/**
 * Set how far this agent may go without a human. A governance act in both directions: raising it widens what
 * runs unattended, lowering it narrows it, and either takes effect at the next authorization decision. Not
 * allowed once retired.
 */
export function setAgentAutonomy(
  agent: AgentDefinition,
  autonomyLevel: AutonomyLevel,
): AgentDefinition {
  if (!isConfigurable(agent)) {
    throw new InvalidAgentTransitionError(agent.status, "autonomy-changed");
  }
  return touch(agent, { autonomyLevel });
}

/** Activate an agent (`draft`/`suspended → active`) — from here it can be authorized. */
export function activateAgent(agent: AgentDefinition): AgentDefinition {
  if (agent.status !== "draft" && agent.status !== "suspended") {
    throw new InvalidAgentTransitionError(agent.status, "active");
  }
  return touch(agent, { status: "active" });
}

/**
 * Suspend an agent (`active → suspended`). The emergency stop: authorization refuses a suspended agent outright,
 * and no approval can rescue it, so suspending is enough to halt everything it does without unpicking its
 * grants.
 */
export function suspendAgent(agent: AgentDefinition): AgentDefinition {
  if (agent.status !== "active") {
    throw new InvalidAgentTransitionError(agent.status, "suspended");
  }
  return touch(agent, { status: "suspended" });
}

/** Retire an agent (terminal). Its plans, invocations and sessions remain — the record of what it did stands. */
export function retireAgent(agent: AgentDefinition): AgentDefinition {
  if (agent.status === "retired") {
    throw new InvalidAgentTransitionError(agent.status, "retired");
  }
  return touch(agent, { status: "retired" });
}

/**
 * Grant a capability. The key is normalized and the list kept sorted, so an agent's reach reads the same however
 * it was assembled. Granting what is already granted is refused rather than ignored: a grant is an audited act,
 * and silently absorbing a duplicate would hide a mistake in whatever asked for it.
 */
export function grantCapability(agent: AgentDefinition, capabilityKey: string): AgentDefinition {
  if (!isConfigurable(agent)) {
    throw new InvalidAgentTransitionError(agent.status, "granted");
  }
  const key = normalizeCapabilityKey(capabilityKey);
  if (key.length === 0) {
    throw new CapabilityNotGrantedError(capabilityKey);
  }
  if (agent.grantedCapabilityKeys.includes(key)) {
    throw new CapabilityAlreadyGrantedError(key);
  }
  return touch(agent, {
    grantedCapabilityKeys: [...agent.grantedCapabilityKeys, key].sort((a, b) => a.localeCompare(b)),
  });
}

/**
 * Revoke a capability. Allowed even while the agent is active — that is the point of a revocation — and it takes
 * effect at the next authorization decision, because the engine reads the current grants every time.
 */
export function revokeCapability(agent: AgentDefinition, capabilityKey: string): AgentDefinition {
  if (!isConfigurable(agent)) {
    throw new InvalidAgentTransitionError(agent.status, "revoked");
  }
  const key = normalizeCapabilityKey(capabilityKey);
  if (!agent.grantedCapabilityKeys.includes(key)) {
    throw new CapabilityNotGrantedError(key);
  }
  return touch(agent, {
    grantedCapabilityKeys: agent.grantedCapabilityKeys.filter((granted) => granted !== key),
  });
}

/** Whether the agent may be authorized to invoke anything at all. */
export const isAgentInvocable = (agent: AgentDefinition): boolean => agent.status === "active";

/** Whether the agent holds this capability. Normalizes first, so a lookup cannot miss on case alone. */
export const hasCapability = (agent: AgentDefinition, capabilityKey: string): boolean =>
  agent.grantedCapabilityKeys.includes(normalizeCapabilityKey(capabilityKey));

/** The narrow view the authorization engine reads. */
export const toAgentView = (agent: AgentDefinition): AgentView => ({
  id: agent.id,
  status: agent.status,
  autonomyLevel: agent.autonomyLevel,
  grantedCapabilityKeys: agent.grantedCapabilityKeys,
});
