import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  CapabilityNotInvocableError,
  DuplicateWorkflowVersionError,
  InvalidWorkflowTransitionError,
  OrganizationNotFoundForDecisionError,
  PublishedWorkflowImmutableError,
  StageNotFoundError,
  UnsoundWorkflowError,
  WorkflowNotFoundError,
} from "./errors";
import { InMemoryWorkflowRepository } from "./ports";
import {
  type CreateWorkflowParams,
  type DefineStageParams,
  type WorkflowDefinition,
  type WorkflowStage,
  defineStage,
} from "./workflow";
import { WorkflowService } from "./workflow-service";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;
const MISSING_ORG = "org-404" as Uuid;

const NOTIFY = "attendance.notify-guardian";
const RETRACT = "attendance.retract-notice";

const REVIEW_STAGE = "review";
const NOTIFY_STAGE = "notify";

/** Every organization exists except the one named to prove the check is actually made. */
const organizations = {
  async exists(_tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    return organizationId !== MISSING_ORG;
  },
};

/** A stage a person carries out: no capability to invoke, nothing to undo. */
const humanStage = (patch: Partial<DefineStageParams> = {}): WorkflowStage =>
  defineStage({
    key: REVIEW_STAGE,
    name: "Pastoral review",
    ordinal: 1,
    kind: "human_task",
    riskLevel: "low",
    reversibility: "reversible",
    assigneeRole: "class-teacher",
    ...patch,
  });

/** A stage the runtime carries out, declaring both the capability it calls and the one that undoes it. */
const actingStage = (patch: Partial<DefineStageParams> = {}): WorkflowStage =>
  defineStage({
    key: NOTIFY_STAGE,
    name: "Notify the guardian",
    ordinal: 2,
    kind: "automated_action",
    capabilityKey: NOTIFY,
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: RETRACT,
    dependsOn: [REVIEW_STAGE],
    ...patch,
  });

describe("WorkflowService", () => {
  let repository: InMemoryWorkflowRepository;
  let unreachable: Set<string>;
  let published: DomainEvent[];
  let svc: WorkflowService;

  beforeEach(() => {
    repository = new InMemoryWorkflowRepository();
    unreachable = new Set<string>();
    published = [];
    svc = new WorkflowService({
      repository,
      organizations,
      capabilities: {
        async isInvocable(_tenantId: TenantId, capabilityKey: string): Promise<boolean> {
          return !unreachable.has(capabilityKey);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const draft = async (patch: Partial<CreateWorkflowParams> = {}): Promise<WorkflowDefinition> =>
    svc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      key: "attendance-intervention",
      name: "Attendance intervention",
      trigger: "manual",
      stages: [humanStage(), actingStage()],
      ...patch,
    });

  const live = async (patch: Partial<CreateWorkflowParams> = {}): Promise<WorkflowDefinition> => {
    const drafted = await draft(patch);
    return svc.publish(TENANT, drafted.id, { publishedByUserId: "user-1" });
  };

  const types = (): readonly string[] => published.map((event) => event.type);

  // --- Authoring -------------------------------------------------------------------

  it("drafts a version that nothing runs under yet, and announces it", async () => {
    const drafted = await draft();

    expect(drafted.status).toBe("draft");
    expect(drafted.version).toBe(1);
    expect(await repository.findById(TENANT, drafted.id)).toEqual(drafted);
    expect(types()).toEqual(["decision.workflow.drafted"]);
  });

  it("refuses a version hung off an organization that is not there", async () => {
    await expect(draft({ organizationId: MISSING_ORG })).rejects.toThrow(
      OrganizationNotFoundForDecisionError,
    );
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("refuses a second version answering to a key and number already taken", async () => {
    await draft();

    await expect(draft({ name: "Attendance intervention (rewrite)" })).rejects.toThrow(
      DuplicateWorkflowVersionError,
    );
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  /**
   * A definition naming a capability nobody can call is a process that stops dead the first time a case reaches
   * that stage. The aggregate cannot see the catalog, so the check belongs here — and it runs before the write,
   * so a refused draft leaves nothing behind.
   */
  it("refuses an automated stage naming a capability nobody can invoke, writing nothing", async () => {
    unreachable.add(NOTIFY);

    await expect(draft()).rejects.toThrow(CapabilityNotInvocableError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(published).toEqual([]);
  });

  /**
   * The contract's third rule does not only apply to stages that act. A human task can be declared compensatable
   * too, and a way back that names nothing reachable is the rule in name only.
   */
  it("checks the way back declared on a stage that does not act", async () => {
    unreachable.add(RETRACT);

    await expect(
      draft({
        stages: [humanStage({ reversibility: "compensatable", compensationKey: RETRACT })],
      }),
    ).rejects.toThrow(CapabilityNotInvocableError);
  });

  /**
   * The mirror image: only an `automated_action` names something the runtime calls, so a capability key sitting
   * on a human task is not checked against the catalog at all. The publication gate is where that gets faulted.
   */
  it("does not check a capability key on a stage that never invokes one", async () => {
    unreachable.add(NOTIFY);

    const drafted = await draft({ stages: [humanStage({ capabilityKey: NOTIFY })] });

    expect(drafted.stages[0]?.capabilityKey).toBe(NOTIFY);
    await expect(svc.publish(TENANT, drafted.id)).rejects.toThrow(UnsoundWorkflowError);
  });

  it("amends what a draft says about itself", async () => {
    const drafted = await draft();

    const amended = await svc.amend(TENANT, drafted.id, {
      name: "Attendance intervention (KS3)",
      description: "  Raised on a fifth consecutive absence  ",
    });

    expect(amended.name).toBe("Attendance intervention (KS3)");
    expect(amended.description).toBe("Raised on a fifth consecutive absence");
    expect(types()).toEqual(["decision.workflow.drafted", "decision.workflow.amended"]);
  });

  it("checks the capabilities of a stage attached later, before the draft is touched", async () => {
    const drafted = await draft({ stages: [humanStage()] });
    unreachable.add(NOTIFY);

    await expect(svc.addStage(TENANT, drafted.id, actingStage())).rejects.toThrow(
      CapabilityNotInvocableError,
    );
    expect((await svc.get(TENANT, drafted.id)).stages).toHaveLength(1);
  });

  it("checks every stage when the whole set is replaced at once", async () => {
    const drafted = await draft({ stages: [humanStage()] });
    unreachable.add(RETRACT);

    await expect(
      svc.replaceStages(TENANT, drafted.id, [humanStage(), actingStage()]),
    ).rejects.toThrow(CapabilityNotInvocableError);

    unreachable.delete(RETRACT);
    const rewired = await svc.replaceStages(TENANT, drafted.id, [humanStage(), actingStage()]);
    expect(rewired.stages).toHaveLength(2);
  });

  it("refuses to detach a stage the definition does not have", async () => {
    const drafted = await draft();

    await expect(svc.removeStage(TENANT, drafted.id, "nowhere")).rejects.toThrow(
      StageNotFoundError,
    );
    expect((await svc.removeStage(TENANT, drafted.id, NOTIFY_STAGE)).stages).toHaveLength(1);
  });

  it("refuses every edit to a version cases are already entering", async () => {
    const version = await live();

    await expect(
      svc.addStage(TENANT, version.id, humanStage({ key: "extra", ordinal: 9 })),
    ).rejects.toThrow(PublishedWorkflowImmutableError);
    await expect(svc.amend(TENANT, version.id, { name: "Something else" })).rejects.toThrow(
      PublishedWorkflowImmutableError,
    );
    await expect(svc.replaceStages(TENANT, version.id, [humanStage()])).rejects.toThrow(
      PublishedWorkflowImmutableError,
    );
  });

  // --- Lifecycle -------------------------------------------------------------------

  it("publishes a sound draft and records who let the cases in", async () => {
    const version = await live();

    expect(version.status).toBe("published");
    expect(version.publishedByUserId).toBe("user-1");
    expect(version.publishedAt).not.toBeNull();
    expect(types()).toEqual(["decision.workflow.drafted", "decision.workflow.published"]);
  });

  /**
   * The reason the check runs twice. A draft can sit for weeks and a capability can be deprecated in between;
   * publication is the moment live cases start entering the process, and the last cheap moment to find out.
   */
  it("re-checks the capabilities at the gate, not merely when the stage was written", async () => {
    const drafted = await draft();
    unreachable.add(NOTIFY);

    await expect(svc.publish(TENANT, drafted.id)).rejects.toThrow(CapabilityNotInvocableError);
    expect((await svc.get(TENANT, drafted.id)).status).toBe("draft");
  });

  it("refuses to publish a definition the inspection faults, and says what is wrong", async () => {
    const drafted = await draft({
      stages: [humanStage(), actingStage({ dependsOn: ["nowhere"] })],
    });

    await expect(svc.publish(TENANT, drafted.id)).rejects.toThrow(UnsoundWorkflowError);
    expect((await svc.get(TENANT, drafted.id)).status).toBe("draft");
  });

  it("refuses to publish anything that is not a draft", async () => {
    const version = await live();

    await expect(svc.publish(TENANT, version.id)).rejects.toThrow(InvalidWorkflowTransitionError);
  });

  it("stops admitting cases for a while, and starts again", async () => {
    const version = await live();

    expect((await svc.suspend(TENANT, version.id)).status).toBe("suspended");
    expect((await svc.resume(TENANT, version.id)).status).toBe("published");
    expect(types()).toContain("decision.workflow.suspended");
    expect(types()).toContain("decision.workflow.resumed");
  });

  it("retires a version for good, and refuses to retire it twice", async () => {
    const version = await live();

    const retired = await svc.retire(TENANT, version.id);
    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();

    await expect(svc.retire(TENANT, version.id)).rejects.toThrow(InvalidWorkflowTransitionError);
  });

  /**
   * The whole reason a process is versioned rather than edited: the cases running under the published version
   * keep meaning what they meant when they started.
   */
  it("revises a published version into a fresh draft, leaving the published one alone", async () => {
    const version = await live();

    const revision = await svc.revise(TENANT, version.id, { createdByUserId: "user-2" });

    expect(revision.version).toBe(2);
    expect(revision.status).toBe("draft");
    expect(revision.key).toBe(version.key);
    expect(revision.stages).toHaveLength(version.stages.length);
    expect(revision.id).not.toBe(version.id);
    expect((await svc.get(TENANT, version.id)).status).toBe("published");
    expect(types()).toContain("decision.workflow.revised");
  });

  it("refuses a revision onto a version number that already exists", async () => {
    const version = await live();
    await svc.revise(TENANT, version.id);

    await expect(svc.revise(TENANT, version.id)).rejects.toThrow(DuplicateWorkflowVersionError);
    expect(await svc.list(TENANT)).toHaveLength(2);
  });

  /**
   * The only removal in this domain. A published version is the shape of processes that ran, and an audit trail
   * whose definitions can vanish is an opinion — so deletion stops at the draft.
   */
  it("discards a draft that never went live, and refuses to discard one that did", async () => {
    const scrapped = await draft();
    await svc.discard(TENANT, scrapped.id);
    expect(await repository.findById(TENANT, scrapped.id)).toBeNull();

    const version = await live();
    await expect(svc.discard(TENANT, version.id)).rejects.toThrow(PublishedWorkflowImmutableError);
    expect(await repository.findById(TENANT, version.id)).not.toBeNull();
  });

  // --- Reading ---------------------------------------------------------------------

  it("finds the version cases enter under a key, and the highest version there is", async () => {
    const version = await live();
    const revision = await svc.revise(TENANT, version.id);

    expect((await svc.findPublished(TENANT, version.key))?.id).toBe(version.id);
    expect((await svc.findLatest(TENANT, version.key))?.id).toBe(revision.id);
    expect(await svc.findPublished(TENANT, "no-such-process")).toBeNull();
  });

  it("lists only the published versions a signal would start", async () => {
    const started = await live({
      key: "attendance-escalation",
      trigger: "signal",
      triggerSignalKey: "attendance.fifth-consecutive-absence",
    });
    await draft({
      key: "attendance-escalation-draft",
      trigger: "signal",
      triggerSignalKey: "attendance.fifth-consecutive-absence",
    });

    const matched = await svc.listBySignal(TENANT, "attendance.fifth-consecutive-absence");

    expect(matched.map((workflow) => workflow.id)).toEqual([started.id]);
    expect(await svc.listBySignal(TENANT, "attendance.no-such-signal")).toEqual([]);
  });

  it("reads only inside the tenant asked about", async () => {
    const mine = await draft();
    await draft({ tenantId: OTHER });

    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(await svc.list(OTHER)).toHaveLength(1);
    expect(await svc.findLatest(OTHER, mine.key)).not.toBe(mine);
    await expect(svc.get(OTHER, mine.id)).rejects.toThrow(WorkflowNotFoundError);
  });

  it("404s on a version that is not there", async () => {
    await expect(svc.get(TENANT, "nobody-1" as Uuid)).rejects.toThrow(WorkflowNotFoundError);
  });

  it("works without an event bus at all", async () => {
    const quiet = new WorkflowService({
      repository,
      organizations,
      capabilities: {
        async isInvocable(): Promise<boolean> {
          return true;
        },
      },
    });

    const drafted = await quiet.draft({
      tenantId: TENANT,
      organizationId: ORG,
      key: "transport-route-review",
      name: "Transport route review",
      trigger: "manual",
      stages: [humanStage()],
    });

    expect((await quiet.publish(TENANT, drafted.id)).status).toBe("published");
    expect(published).toEqual([]);
  });
});
