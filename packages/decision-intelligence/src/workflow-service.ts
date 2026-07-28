import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  workflowAmended,
  workflowDrafted,
  workflowPublished,
  workflowResumed,
  workflowRetired,
  workflowRevised,
  workflowSuspended,
} from "./decision-events";
import {
  CapabilityNotInvocableError,
  DuplicateWorkflowVersionError,
  OrganizationNotFoundForDecisionError,
  PublishedWorkflowImmutableError,
  WorkflowNotFoundError,
} from "./errors";
import type { CapabilityDirectory, OrganizationDirectory, WorkflowRepository } from "./ports";
import {
  type AmendWorkflowParams,
  type CreateWorkflowParams,
  type DefineStageParams,
  type PublishWorkflowParams,
  type ReviseWorkflowParams,
  type WorkflowDefinition,
  type WorkflowStage,
  addStage,
  amendWorkflow,
  createWorkflow,
  publishWorkflow,
  removeStage,
  replaceStages,
  resumeWorkflow,
  retireWorkflow,
  reviseWorkflow,
  suspendWorkflow,
} from "./workflow";

/**
 * Application service for workflow definitions — the processes an institution runs, versioned.
 *
 * The aggregate can say whether a definition is *coherent*: that its stages depend only on stages that exist,
 * that nothing cycles, that an irreversible automated stage is declared as such. What it cannot say is whether
 * the capabilities it names are *there*. So this service checks every acting stage's `capabilityKey` and every
 * declared `compensationKey` against the catalog, twice: when the stage is attached, and again at publication.
 *
 * Checking twice is deliberate. A draft can sit for weeks, and a capability can be deprecated in between; the
 * check at attach-time tells an author immediately, and the check at publish-time is the one that matters,
 * because publication is the moment cases start entering the process. After that the definition is frozen and
 * the only way to change it is a new version, which is the whole reason workflows are versioned.
 *
 * Uniqueness of `(key, version)` also lives here, for the ordinary reason: an aggregate cannot see its siblings.
 */
export interface WorkflowServiceDeps {
  readonly repository: WorkflowRepository;
  readonly organizations: OrganizationDirectory;
  readonly capabilities: CapabilityDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class WorkflowService {
  private readonly repository: WorkflowRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly capabilities: CapabilityDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: WorkflowServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.capabilities = deps.capabilities;
    this.events = deps.events;
  }

  // --- Authoring -------------------------------------------------------------------

  /** Draft a new version of a process. Nothing runs under a draft; it exists to be got right. */
  async draft(input: CreateWorkflowParams): Promise<WorkflowDefinition> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForDecisionError(input.organizationId);
    }

    const workflow = createWorkflow(input);
    const clash = await this.repository.findByKeyAndVersion(
      workflow.tenantId,
      workflow.key,
      workflow.version,
    );
    if (clash) {
      throw new DuplicateWorkflowVersionError(workflow.key, workflow.version);
    }
    await this.requireStagesInvocable(workflow.tenantId, workflow.stages);

    await this.repository.save(workflow);
    await this.emit(workflowDrafted(workflow));
    return workflow;
  }

  /** Amend what a draft says about itself. */
  async amend(
    tenantId: TenantId,
    id: Uuid,
    params: AmendWorkflowParams,
  ): Promise<WorkflowDefinition> {
    return this.transition(tenantId, id, amendWorkflow, workflowAmended, params);
  }

  /** Attach a stage, once the capabilities it names are known to be reachable. */
  async addStage(
    tenantId: TenantId,
    id: Uuid,
    params: DefineStageParams,
  ): Promise<WorkflowDefinition> {
    await this.requireStageInvocable(
      tenantId,
      params.kind,
      params.capabilityKey,
      params.compensationKey,
    );
    return this.transition(tenantId, id, addStage, workflowAmended, params);
  }

  /** Detach a stage. Refused by the aggregate if anything still depends on it. */
  async removeStage(tenantId: TenantId, id: Uuid, stageKey: string): Promise<WorkflowDefinition> {
    return this.transition(tenantId, id, removeStage, workflowAmended, stageKey);
  }

  /** Replace the whole stage set at once — how a process is wired when the dependencies cross-reference. */
  async replaceStages(
    tenantId: TenantId,
    id: Uuid,
    stages: readonly WorkflowStage[],
  ): Promise<WorkflowDefinition> {
    await this.requireStagesInvocable(tenantId, stages);
    return this.transition(tenantId, id, replaceStages, workflowAmended, stages);
  }

  // --- Lifecycle -------------------------------------------------------------------

  /**
   * Publish. The aggregate refuses an unsound definition; this re-checks every capability first, because a
   * draft that was reachable when it was written may not be reachable now, and publication is the last cheap
   * moment to find that out.
   */
  async publish(
    tenantId: TenantId,
    id: Uuid,
    params: PublishWorkflowParams = {},
  ): Promise<WorkflowDefinition> {
    const workflow = await this.require(tenantId, id);
    await this.requireStagesInvocable(tenantId, workflow.stages);
    return this.transition(tenantId, id, publishWorkflow, workflowPublished, params);
  }

  /** Stop admitting new cases for a while. Running cases are untouched. */
  async suspend(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition> {
    return this.transition(tenantId, id, suspendWorkflow, workflowSuspended);
  }

  /** Admit cases again. */
  async resume(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition> {
    return this.transition(tenantId, id, resumeWorkflow, workflowResumed);
  }

  /** Retire this version for good. Running cases finish; no new ones start. */
  async retire(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition> {
    return this.transition(tenantId, id, retireWorkflow, workflowRetired);
  }

  /**
   * Revise a published version into a fresh draft at the next version number. The published one is untouched,
   * and so are the cases running inside it.
   */
  async revise(
    tenantId: TenantId,
    id: Uuid,
    params: ReviseWorkflowParams = {},
  ): Promise<WorkflowDefinition> {
    const workflow = await this.require(tenantId, id);
    const revision = reviseWorkflow(workflow, params);

    const clash = await this.repository.findByKeyAndVersion(
      revision.tenantId,
      revision.key,
      revision.version,
    );
    if (clash) {
      throw new DuplicateWorkflowVersionError(revision.key, revision.version);
    }

    await this.repository.save(revision);
    await this.emit(workflowRevised(revision));
    return revision;
  }

  /**
   * Delete a draft that was never published.
   *
   * The only removal in this domain, and it is bounded to drafts on purpose. A published version is the shape
   * of processes that ran; deleting it would make the cases that carry its id point at nothing, and an audit
   * trail whose definitions can vanish is an opinion. Retirement is the way out for everything else.
   */
  async discard(tenantId: TenantId, id: Uuid): Promise<void> {
    const workflow = await this.require(tenantId, id);
    if (workflow.status !== "draft") {
      throw new PublishedWorkflowImmutableError(workflow.id, workflow.status);
    }
    await this.repository.remove(tenantId, id);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One version, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition> {
    return this.require(tenantId, id);
  }

  /** The version cases currently enter under this key, if there is one. */
  async findPublished(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null> {
    return this.repository.findPublishedByKey(tenantId, key);
  }

  /** The highest version under this key, whatever its status — how an author finds where to revise from. */
  async findLatest(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null> {
    return this.repository.findLatestByKey(tenantId, key);
  }

  /** Every published version a signal would start. */
  async listBySignal(
    tenantId: TenantId,
    signalKey: string,
  ): Promise<readonly WorkflowDefinition[]> {
    return this.repository.listBySignal(tenantId, signalKey);
  }

  /** Every version in the tenant. */
  async list(tenantId: TenantId): Promise<readonly WorkflowDefinition[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The definition under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition> {
    const workflow = await this.repository.findById(tenantId, id);
    if (!workflow) {
      throw new WorkflowNotFoundError(id);
    }
    return workflow;
  }

  /** Every stage's capabilities, checked against the catalog. */
  private async requireStagesInvocable(
    tenantId: TenantId,
    stages: readonly WorkflowStage[],
  ): Promise<void> {
    for (const stage of stages) {
      await this.requireStageInvocable(
        tenantId,
        stage.kind,
        stage.capabilityKey,
        stage.compensationKey,
      );
    }
  }

  /**
   * One stage's two capabilities. Only an `automated_action` names a capability to invoke — a human task's
   * assignee is a role, not something the runtime calls — but *any* stage may declare a compensation, and a
   * compensation that names nothing reachable is the contract's third rule in name only.
   */
  private async requireStageInvocable(
    tenantId: TenantId,
    kind: string,
    capabilityKey: string | null | undefined,
    compensationKey: string | null | undefined,
  ): Promise<void> {
    if (kind === "automated_action" && capabilityKey) {
      await this.requireInvocable(tenantId, capabilityKey, "stage");
    }
    if (compensationKey) {
      await this.requireInvocable(tenantId, compensationKey, "compensation");
    }
  }

  /** One capability key, checked against the catalog. */
  private async requireInvocable(
    tenantId: TenantId,
    capabilityKey: string,
    role: string,
  ): Promise<void> {
    if (!(await this.capabilities.isInvocable(tenantId, capabilityKey))) {
      throw new CapabilityNotInvocableError(capabilityKey, role);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (workflow: WorkflowDefinition, ...args: TArgs) => WorkflowDefinition,
    announce: (workflow: WorkflowDefinition) => DomainEvent,
    ...args: TArgs
  ): Promise<WorkflowDefinition> {
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
