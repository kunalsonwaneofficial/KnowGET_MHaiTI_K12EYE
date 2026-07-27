import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  capabilityActivated,
  capabilityDeprecated,
  capabilityDescribed,
  capabilityReclassified,
  capabilityRegistered,
} from "./ai-events";
import {
  type CreateToolDefinitionParams,
  type ReclassifyToolPatch,
  type ToolDefinition,
  activateTool,
  createToolDefinition,
  deprecateTool,
  describeTool,
  reclassifyTool,
} from "./tool";
import {
  DuplicateToolError,
  OrganizationNotFoundForAgentError,
  ToolNotFoundError,
  UnknownCapabilityError,
} from "./errors";
import type { OrganizationDirectory, ToolRepository } from "./ports";

/**
 * Application service for the capability catalog — the set of things any agent can be pointed at.
 *
 * The service adds what the aggregate cannot check alone: one entry per key per tenant, and the referential half
 * of the compensation rule. The aggregate already refuses a `compensatable` capability that names no undo and
 * refuses one that names itself; what it cannot know is whether the named undo *exists*. A rollback that reaches
 * for a compensating capability nobody registered fails at the worst possible moment — mid-recovery, after the
 * thing worth undoing has already happened. So the reference is resolved here, when it is written.
 */
export interface ToolServiceDeps {
  readonly repository: ToolRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ToolService {
  private readonly repository: ToolRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ToolServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  /** Register a capability in the catalog. It starts drafted and cannot be invoked until activated. */
  async register(input: CreateToolDefinitionParams): Promise<ToolDefinition> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAgentError(input.organizationId);
    }
    const tool = createToolDefinition(input);
    const existing = await this.repository.findByKey(tool.tenantId, tool.key);
    if (existing) {
      throw new DuplicateToolError(tool.key);
    }
    await this.requireCompensationExists(tool);
    await this.repository.save(tool);
    await this.emit(capabilityRegistered(tool));
    return tool;
  }

  async describe(
    tenantId: TenantId,
    id: Uuid,
    patch: { name?: string; description?: string | null },
  ): Promise<ToolDefinition> {
    const next = describeTool(await this.require(tenantId, id), patch);
    await this.repository.save(next);
    await this.emit(capabilityDescribed(next));
    return next;
  }

  /**
   * Restate a capability's risk profile. Reclassification is the most consequential edit in the catalog — it
   * moves the gate for every agent already granted the key — so the compensation reference is re-resolved.
   */
  async reclassify(
    tenantId: TenantId,
    id: Uuid,
    patch: ReclassifyToolPatch,
  ): Promise<ToolDefinition> {
    const next = reclassifyTool(await this.require(tenantId, id), patch);
    await this.requireCompensationExists(next);
    await this.repository.save(next);
    await this.emit(capabilityReclassified(next));
    return next;
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<ToolDefinition> {
    const next = activateTool(await this.require(tenantId, id));
    await this.requireCompensationExists(next);
    await this.repository.save(next);
    await this.emit(capabilityActivated(next));
    return next;
  }

  async deprecate(tenantId: TenantId, id: Uuid): Promise<ToolDefinition> {
    const next = deprecateTool(await this.require(tenantId, id));
    await this.repository.save(next);
    await this.emit(capabilityDeprecated(next));
    return next;
  }

  async get(tenantId: TenantId, id: Uuid): Promise<ToolDefinition> {
    return this.require(tenantId, id);
  }

  /** Resolve by registry key — the lookup every grant, plan step and invocation actually makes. */
  async getByKey(tenantId: TenantId, key: string): Promise<ToolDefinition> {
    const tool = await this.repository.findByKey(tenantId, key);
    if (!tool) {
      throw new UnknownCapabilityError(key);
    }
    return tool;
  }

  async list(tenantId: TenantId): Promise<ToolDefinition[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** Remove a draft entry. An active capability is deprecated, never deleted — invocations still refer to it. */
  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    await this.require(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ToolDefinition> {
    const tool = await this.repository.findById(tenantId, id);
    if (!tool) {
      throw new ToolNotFoundError(id);
    }
    return tool;
  }

  /** A declared compensating capability must be a capability. Otherwise the rollback path is a dead link. */
  private async requireCompensationExists(tool: ToolDefinition): Promise<void> {
    if (tool.compensationKey === null) {
      return;
    }
    const compensator = await this.repository.findByKey(tool.tenantId, tool.compensationKey);
    if (!compensator) {
      throw new UnknownCapabilityError(tool.compensationKey);
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
