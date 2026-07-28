import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import type { OverdueStage, ReversalPlan } from "./decision-view";
import {
  instanceCancelled,
  instanceCompleted,
  instanceFailed,
  instanceStageBegun,
  instanceStageCompensated,
  instanceStageCompleted,
  instanceStageFailed,
  instanceStageSkipped,
  instanceStarted,
} from "./decision-events";
import {
  CapabilityNotInvocableError,
  StageNotFoundError,
  WorkflowInstanceNotFoundError,
  WorkflowNotFoundError,
} from "./errors";
import { overdueStages, readyStageKeys } from "./orchestration";
import type { CapabilityDirectory, WorkflowInstanceRepository, WorkflowRepository } from "./ports";
import { planReversal } from "./reversal";
import { type WorkflowDefinition, toWorkflowStageViews, workflowStage } from "./workflow";
import {
  type BeginStageParams,
  type CancelWorkflowInstanceParams,
  type CompleteStageParams,
  type FailStageParams,
  type SkipStageParams,
  type StageRun,
  type StartWorkflowInstanceParams,
  type WorkflowInstance,
  beginStage,
  cancelWorkflowInstance,
  compensateStage,
  completeStage,
  failStage,
  instanceStageRun,
  skipStage,
  startWorkflowInstance,
  toStageRunViews,
} from "./workflow-instance";

/**
 * Application service for workflow instances — the individual cases running inside a process.
 *
 * A case is started from the *published* version of a key, never from a version id a caller chose. That is
 * deliberate: whoever starts a case is describing what should happen to a student or an invoice, not selecting
 * a revision of the process, and letting them name a version is how cases end up running under drafts.
 *
 * The instance aggregate settles itself the moment nothing is outstanding, which means a stage transition can
 * finish the whole case. So every stage move announces two things when that happens: what the stage did, and
 * that the case is over. Callers that only listen for the case-level event would otherwise never learn a case
 * ended, and callers that only listen for stage events would never learn *which* ending it was.
 *
 * The contract's third rule is enforced at the moment of use: before a completed stage is recorded as put back,
 * the compensating capability the *definition* declared is checked to be reachable. The instance does not carry
 * that key — it carries what happened, not what was promised — so the definition is loaded to find it.
 */
export interface WorkflowRunServiceDeps {
  readonly repository: WorkflowInstanceRepository;
  readonly workflows: WorkflowRepository;
  readonly capabilities: CapabilityDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class WorkflowRunService {
  private readonly repository: WorkflowInstanceRepository;
  private readonly workflows: WorkflowRepository;
  private readonly capabilities: CapabilityDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: WorkflowRunServiceDeps) {
    this.repository = deps.repository;
    this.workflows = deps.workflows;
    this.capabilities = deps.capabilities;
    this.events = deps.events;
  }

  // --- Starting --------------------------------------------------------------------

  /**
   * Start a case under whatever version of this key is currently published. A key with no published version is
   * a 404 on the key itself, which is the truthful answer: as far as anyone trying to run this process is
   * concerned, it does not exist.
   */
  async start(
    tenantId: TenantId,
    workflowKey: string,
    params: StartWorkflowInstanceParams,
  ): Promise<WorkflowInstance> {
    const workflow = await this.workflows.findPublishedByKey(tenantId, workflowKey);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowKey);
    }

    const instance = startWorkflowInstance(workflow, params);
    await this.repository.save(instance);
    await this.emit(instanceStarted(instance));
    return instance;
  }

  // --- Stages ----------------------------------------------------------------------

  /** Pick a pending stage up. Refused until everything it depends on has settled. */
  async beginStage(
    tenantId: TenantId,
    id: Uuid,
    stageKey: string,
    params: BeginStageParams = {},
  ): Promise<WorkflowInstance> {
    return this.moveStage(tenantId, id, stageKey, instanceStageBegun, (instance) =>
      beginStage(instance, stageKey, params),
    );
  }

  /** Finish an active stage. This may finish the whole case. */
  async completeStage(
    tenantId: TenantId,
    id: Uuid,
    stageKey: string,
    params: CompleteStageParams = {},
  ): Promise<WorkflowInstance> {
    return this.moveStage(tenantId, id, stageKey, instanceStageCompleted, (instance) =>
      completeStage(instance, stageKey, params),
    );
  }

  /** Pass over a stage the definition declared optional. A required stage is not skippable at any price. */
  async skipStage(
    tenantId: TenantId,
    id: Uuid,
    stageKey: string,
    params: SkipStageParams = {},
  ): Promise<WorkflowInstance> {
    return this.moveStage(tenantId, id, stageKey, instanceStageSkipped, (instance) =>
      skipStage(instance, stageKey, params),
    );
  }

  /** A stage could not be carried out. The case stops at it. */
  async failStage(
    tenantId: TenantId,
    id: Uuid,
    stageKey: string,
    params: FailStageParams,
  ): Promise<WorkflowInstance> {
    return this.moveStage(tenantId, id, stageKey, instanceStageFailed, (instance) =>
      failStage(instance, stageKey, params),
    );
  }

  /**
   * Record that a completed stage has been put back.
   *
   * The compensating capability comes from the definition rather than the case, and is checked to be reachable
   * before anything is written. A reversal recorded against a capability nobody can call leaves the institution
   * believing something was undone that was not, which is the exact failure the third rule exists to prevent.
   */
  async compensateStage(tenantId: TenantId, id: Uuid, stageKey: string): Promise<WorkflowInstance> {
    const instance = await this.require(tenantId, id);
    const definition = await this.requireDefinition(tenantId, instance.workflowId);
    const stage = workflowStage(definition, stageKey);
    if (!stage) {
      throw new StageNotFoundError(definition.id, stageKey);
    }
    if (stage.compensationKey) {
      await this.requireInvocable(tenantId, stage.compensationKey, "compensation");
    }

    return this.moveStage(tenantId, id, stageKey, instanceStageCompensated, (current) =>
      compensateStage(current, stageKey),
    );
  }

  /** Stop a case early. A named person cancels; nothing cancels itself. */
  async cancel(
    tenantId: TenantId,
    id: Uuid,
    params: CancelWorkflowInstanceParams,
  ): Promise<WorkflowInstance> {
    const next = cancelWorkflowInstance(await this.require(tenantId, id), params);
    await this.repository.save(next);
    await this.emit(instanceCancelled(next));
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One case, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<WorkflowInstance> {
    return this.require(tenantId, id);
  }

  /** Every case ever run under one version — how an author sees what their process actually did. */
  async listByWorkflow(tenantId: TenantId, workflowId: Uuid): Promise<readonly WorkflowInstance[]> {
    return this.repository.listByWorkflow(tenantId, workflowId);
  }

  /** Every case about one subject, across every process. */
  async listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<readonly WorkflowInstance[]> {
    return this.repository.listBySubject(tenantId, subjectDomain, subjectId);
  }

  /** Everything still in flight. */
  async listRunning(tenantId: TenantId): Promise<readonly WorkflowInstance[]> {
    return this.repository.listRunning(tenantId);
  }

  /** Every case in the tenant. */
  async list(tenantId: TenantId): Promise<readonly WorkflowInstance[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** The stages that could be picked up right now, by the orchestration engine's reckoning. */
  async ready(tenantId: TenantId, id: Uuid): Promise<readonly string[]> {
    const { definition, instance } = await this.requirePair(tenantId, id);
    return readyStageKeys(toWorkflowStageViews(definition), toStageRunViews(instance));
  }

  /**
   * The stages that have run past the time the definition allowed them. The instant is supplied rather than
   * read from a clock, so what an operations screen shows and what a test asserts are the same function.
   */
  async overdue(
    tenantId: TenantId,
    id: Uuid,
    asOf: ISODateString,
  ): Promise<readonly OverdueStage[]> {
    const { definition, instance } = await this.requirePair(tenantId, id);
    return overdueStages(toWorkflowStageViews(definition), toStageRunViews(instance), asOf);
  }

  /**
   * What it would take to undo this case as it stands, in the order it would have to be undone, and what could
   * not be undone at all. The question anyone stopping a case halfway needs answered before they stop it.
   */
  async reversalPlan(tenantId: TenantId, id: Uuid): Promise<ReversalPlan> {
    const { definition, instance } = await this.requirePair(tenantId, id);
    return planReversal(toWorkflowStageViews(definition), toStageRunViews(instance));
  }

  // --- Internals -------------------------------------------------------------------

  /** The case under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<WorkflowInstance> {
    const instance = await this.repository.findById(tenantId, id);
    if (!instance) {
      throw new WorkflowInstanceNotFoundError(id);
    }
    return instance;
  }

  /** The version a case is running under, or a 404 naming it. */
  private async requireDefinition(
    tenantId: TenantId,
    workflowId: Uuid,
  ): Promise<WorkflowDefinition> {
    const workflow = await this.workflows.findById(tenantId, workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    return workflow;
  }

  /** A case and the version it is running under, for every read that compares one against the other. */
  private async requirePair(
    tenantId: TenantId,
    id: Uuid,
  ): Promise<{ instance: WorkflowInstance; definition: WorkflowDefinition }> {
    const instance = await this.require(tenantId, id);
    const definition = await this.requireDefinition(tenantId, instance.workflowId);
    return { instance, definition };
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

  /**
   * Every stage move: load, apply, save, announce what the stage did — and announce the case ending too when
   * the aggregate settled it on the way through.
   */
  private async moveStage(
    tenantId: TenantId,
    id: Uuid,
    stageKey: string,
    announce: (instance: WorkflowInstance, run: StageRun) => DomainEvent,
    move: (instance: WorkflowInstance) => WorkflowInstance,
  ): Promise<WorkflowInstance> {
    const before = await this.require(tenantId, id);
    const next = move(before);
    await this.repository.save(next);

    const run = instanceStageRun(next, stageKey);
    if (run) {
      await this.emit(announce(next, run));
    }
    await this.announceSettlement(before, next);
    return next;
  }

  /** The case-level event, emitted only on the transition that ended the case. */
  private async announceSettlement(
    before: WorkflowInstance,
    next: WorkflowInstance,
  ): Promise<void> {
    if (next.status === before.status) {
      return;
    }
    if (next.status === "completed") {
      await this.emit(instanceCompleted(next));
    } else if (next.status === "failed") {
      await this.emit(instanceFailed(next));
    }
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
