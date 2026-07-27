import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { AutonomyLevel } from "./ai-value";
import { normalizeCapabilityKey } from "./ai-value";
import {
  type AgentDefinition,
  type CreateAgentDefinitionParams,
  activateAgent,
  createAgentDefinition,
  describeAgent,
  grantCapability,
  retireAgent,
  revokeCapability,
  setAgentAutonomy,
  suspendAgent,
} from "./agent";
import {
  agentActivated,
  agentAutonomySet,
  agentCapabilityGranted,
  agentCapabilityRevoked,
  agentDescribed,
  agentRegistered,
  agentRetired,
  agentSuspended,
} from "./ai-events";
import {
  AgentNotFoundError,
  DuplicateAgentError,
  OrganizationNotFoundForAgentError,
  UnknownCapabilityError,
} from "./errors";
import type { AgentRepository, OrganizationDirectory, ToolRepository } from "./ports";

/**
 * Application service for the agent registry.
 *
 * Two rules live here rather than in the aggregate, because both need to read something the aggregate cannot
 * see. The first is uniqueness: one agent per key per tenant, checked against the store. The second is the one
 * that matters — a capability may only be granted if it is *in the catalog*. The aggregate happily records any
 * string, and must, since it holds no catalog; but a grant naming a key nothing answers to is a permission that
 * looks real in an audit and authorizes nothing, or worse, silently starts authorizing something the day a
 * capability is registered under that name. The catalog is checked here, at the only door grants come through.
 */
export interface AgentServiceDeps {
  readonly repository: AgentRepository;
  readonly capabilities: ToolRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class AgentService {
  private readonly repository: AgentRepository;
  private readonly capabilities: ToolRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AgentServiceDeps) {
    this.repository = deps.repository;
    this.capabilities = deps.capabilities;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  /** Register an agent. It starts drafted, with no reach at all. */
  async register(input: CreateAgentDefinitionParams): Promise<AgentDefinition> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAgentError(input.organizationId);
    }
    const agent = createAgentDefinition(input);
    const existing = await this.repository.findByKey(agent.tenantId, agent.key);
    if (existing) {
      throw new DuplicateAgentError(agent.key);
    }
    await this.repository.save(agent);
    await this.emit(agentRegistered(agent));
    return agent;
  }

  async describe(
    tenantId: TenantId,
    id: Uuid,
    patch: { name?: string; purpose?: string | null },
  ): Promise<AgentDefinition> {
    return this.transition(tenantId, id, describeAgent, agentDescribed, patch);
  }

  async setAutonomy(
    tenantId: TenantId,
    id: Uuid,
    autonomyLevel: AutonomyLevel,
  ): Promise<AgentDefinition> {
    return this.transition(tenantId, id, setAgentAutonomy, agentAutonomySet, autonomyLevel);
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<AgentDefinition> {
    return this.transition(tenantId, id, activateAgent, agentActivated);
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<AgentDefinition> {
    return this.transition(tenantId, id, suspendAgent, agentSuspended);
  }

  async retire(tenantId: TenantId, id: Uuid): Promise<AgentDefinition> {
    return this.transition(tenantId, id, retireAgent, agentRetired);
  }

  /**
   * Grant a capability — but only one the catalog actually knows. A grant is the whole of an agent's reach, so
   * the moment it is written is the moment to be sure it names something real.
   */
  async grant(tenantId: TenantId, id: Uuid, capabilityKey: string): Promise<AgentDefinition> {
    const agent = await this.require(tenantId, id);
    const key = normalizeCapabilityKey(capabilityKey);
    const catalogued = await this.capabilities.findByKey(tenantId, key);
    if (!catalogued) {
      throw new UnknownCapabilityError(key);
    }
    const granted = grantCapability(agent, key);
    await this.repository.save(granted);
    await this.emit(agentCapabilityGranted(granted, key));
    return granted;
  }

  /**
   * Withdraw a capability. Deliberately *not* checked against the catalog: a grant naming a key that has since
   * left the catalog is exactly the grant most worth being able to take away.
   */
  async revoke(tenantId: TenantId, id: Uuid, capabilityKey: string): Promise<AgentDefinition> {
    const agent = await this.require(tenantId, id);
    const key = normalizeCapabilityKey(capabilityKey);
    const revoked = revokeCapability(agent, key);
    await this.repository.save(revoked);
    await this.emit(agentCapabilityRevoked(revoked, key));
    return revoked;
  }

  async get(tenantId: TenantId, id: Uuid): Promise<AgentDefinition> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<AgentDefinition[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** Remove a draft agent. Anything that has ever been active is retired, never deleted. */
  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AgentDefinition> {
    const agent = await this.repository.findById(tenantId, id);
    if (!agent) {
      throw new AgentNotFoundError(id);
    }
    return agent;
  }

  /** Load, apply a guarded pure transition, save, announce. Every lifecycle move on this aggregate is this. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (agent: AgentDefinition, ...args: TArgs) => AgentDefinition,
    announce: (agent: AgentDefinition) => DomainEvent,
    ...args: TArgs
  ): Promise<AgentDefinition> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
