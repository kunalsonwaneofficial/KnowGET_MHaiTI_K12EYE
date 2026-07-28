import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AutomationRule,
  type CreateAutomationRuleParams,
  type DeclareActionParams,
  declareAction,
  declareCondition,
} from "./automation-rule";
import { AutomationService } from "./automation-service";
import type { ActionView } from "./decision-view";
import {
  ActiveRuleImmutableError,
  AutomationRuleNotFoundError,
  CapabilityNotInvocableError,
  DuplicateRuleKeyError,
  InvalidRuleTransitionError,
  OrganizationNotFoundForDecisionError,
  UnsafeAutomationRuleError,
} from "./errors";
import { InMemoryAutomationRuleRepository } from "./ports";

const TENANT = "tenant-1" as TenantId;
const OTHER = "tenant-2" as TenantId;
const ORG = "org-1" as Uuid;
const MISSING_ORG = "org-404" as Uuid;

const NOTIFY = "attendance.notify-guardian";
const RETRACT = "attendance.retract-notice";
const SIGNAL = "attendance.fifth-consecutive-absence";

/** Every organization exists except the one named to prove the check is actually made. */
const organizations = {
  async exists(_tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    return organizationId !== MISSING_ORG;
  },
};

/** The ordinary shape of something a rule would request: low risk, with a declared way back. */
const invocation = (patch: Partial<DeclareActionParams> = {}): ActionView =>
  declareAction({
    kind: "invoke_capability",
    targetKey: NOTIFY,
    riskLevel: "low",
    reversibility: "compensatable",
    compensationKey: RETRACT,
    ...patch,
  });

describe("AutomationService", () => {
  let repository: InMemoryAutomationRuleRepository;
  let unreachable: Set<string>;
  let published: DomainEvent[];
  let svc: AutomationService;

  beforeEach(() => {
    repository = new InMemoryAutomationRuleRepository();
    unreachable = new Set<string>();
    published = [];
    svc = new AutomationService({
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

  const draft = async (patch: Partial<CreateAutomationRuleParams> = {}): Promise<AutomationRule> =>
    svc.draft({
      tenantId: TENANT,
      organizationId: ORG,
      key: "notify-on-fifth-absence",
      name: "Notify the guardian on a fifth consecutive absence",
      signalKey: SIGNAL,
      action: invocation(),
      autonomyMode: "auto_execute",
      ...patch,
    });

  const live = async (patch: Partial<CreateAutomationRuleParams> = {}): Promise<AutomationRule> =>
    svc.activate(TENANT, (await draft(patch)).id, { activatedByUserId: "user-6602" });

  const types = (): readonly string[] => published.map((event) => event.type);

  // --- Authoring -------------------------------------------------------------------

  it("drafts a rule that is not yet firing, and announces it", async () => {
    const rule = await draft();

    expect(rule.status).toBe("draft");
    expect(rule.activatedAt).toBeNull();
    expect(rule.activatedByUserId).toBeNull();
    expect(await repository.findById(TENANT, rule.id)).toEqual(rule);
    expect(types()).toEqual(["decision.automation_rule.drafted"]);
  });

  it("refuses a rule hung off an organization that is not there", async () => {
    await expect(draft({ organizationId: MISSING_ORG })).rejects.toThrow(
      OrganizationNotFoundForDecisionError,
    );
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("refuses a second rule under a key already taken, however it was typed in", async () => {
    await draft();

    await expect(draft({ key: "  NOTIFY-ON-FIFTH-ABSENCE  " })).rejects.toThrow(
      DuplicateRuleKeyError,
    );
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  /**
   * A rule is the one thing here that acts with nobody present. A rule pointing at a capability that is not
   * there fails on a Sunday night against a student's record, and the first anyone hears of it is a report that
   * does not add up — so the catalog is consulted before the rule is written down at all.
   */
  it("refuses a rule naming a capability nobody can invoke, writing nothing", async () => {
    unreachable.add(NOTIFY);

    await expect(draft()).rejects.toThrow(CapabilityNotInvocableError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(published).toEqual([]);
  });

  it("checks the declared way back as closely as the action itself", async () => {
    unreachable.add(RETRACT);

    await expect(draft()).rejects.toThrow(CapabilityNotInvocableError);
  });

  it("does not check a workflow key against the capability catalog", async () => {
    unreachable.add("guardian-escalation");

    const rule = await draft({
      action: invocation({
        kind: "start_workflow",
        targetKey: "guardian-escalation",
        reversibility: "reversible",
        compensationKey: null,
      }),
    });

    expect(rule.action.targetKey).toBe("guardian-escalation");
  });

  it("amends a rule that is not firing, and checks a new action before accepting it", async () => {
    const rule = await draft();

    const amended = await svc.amend(TENANT, rule.id, { name: "Notify the guardian sooner" });
    expect(amended.name).toBe("Notify the guardian sooner");

    unreachable.add("attendance.call-home");
    await expect(
      svc.amend(TENANT, rule.id, { action: invocation({ targetKey: "attendance.call-home" }) }),
    ).rejects.toThrow(CapabilityNotInvocableError);
    expect((await svc.get(TENANT, rule.id)).action.targetKey).toBe(NOTIFY);
  });

  it("narrows what the rule fires on by a fact, and widens it again", async () => {
    const rule = await draft();

    const narrowed = await svc.addCondition(
      TENANT,
      rule.id,
      declareCondition({ key: "consecutive-days", operator: "greater_than", values: ["4"] }),
    );
    expect(narrowed.conditions).toHaveLength(1);

    const widened = await svc.removeConditions(TENANT, rule.id, "  CONSECUTIVE-DAYS  ");
    expect(widened.conditions).toEqual([]);
    expect(types()).toEqual([
      "decision.automation_rule.drafted",
      "decision.automation_rule.amended",
      "decision.automation_rule.amended",
    ]);
  });

  /** An unattended rule is not edited underneath the people accountable for it. Pause it, change it, re-arm it. */
  it("refuses every edit to a rule that is currently firing", async () => {
    const rule = await live();

    await expect(svc.amend(TENANT, rule.id, { name: "Something else" })).rejects.toThrow(
      ActiveRuleImmutableError,
    );
    await expect(
      svc.addCondition(
        TENANT,
        rule.id,
        declareCondition({ key: "year-group", operator: "exists" }),
      ),
    ).rejects.toThrow(ActiveRuleImmutableError);
  });

  // --- The activation gate ---------------------------------------------------------

  it("turns a rule on and records who allowed it to run", async () => {
    const rule = await live();

    expect(rule.status).toBe("active");
    expect(rule.activatedByUserId).toBe("user-6602");
    expect(rule.activatedAt).not.toBeNull();
    expect(types()).toEqual([
      "decision.automation_rule.drafted",
      "decision.automation_rule.activated",
    ]);
  });

  /**
   * A draft can sit for weeks between being written and being armed. Activation is the last moment before the
   * rule starts acting on its own, so the catalog is consulted again rather than trusted from drafting time.
   */
  it("re-checks the capabilities at the moment the rule gains the standing to act", async () => {
    const rule = await draft();
    unreachable.add(NOTIFY);

    await expect(svc.activate(TENANT, rule.id)).rejects.toThrow(CapabilityNotInvocableError);
    expect((await svc.get(TENANT, rule.id)).status).toBe("draft");
  });

  /**
   * Written down deliberately, so its author can read back exactly what is wrong with it — and refused at the
   * gate, because approving a standing unattended rule to do something that can never be recalled is not a
   * decision worth offering anyone.
   */
  it("drafts a rule whose action can never be undone, and refuses to arm it", async () => {
    const rule = await draft({
      action: invocation({ reversibility: "irreversible", compensationKey: null }),
    });

    expect(rule.status).toBe("draft");
    await expect(svc.activate(TENANT, rule.id)).rejects.toThrow(UnsafeAutomationRuleError);
  });

  it("refuses to arm a rule that claims a way back and names none", async () => {
    const rule = await draft({ action: invocation({ compensationKey: null }) });

    await expect(svc.activate(TENANT, rule.id)).rejects.toThrow(UnsafeAutomationRuleError);
  });

  /** Stopping for a person is not an objection to leaving the rule running — it is the rule working. */
  it("arms a rule that would stop for a person on every firing", async () => {
    const rule = await live({
      autonomyMode: "auto_with_approval",
      action: invocation({ riskLevel: "high" }),
    });

    expect(rule.status).toBe("active");
  });

  /**
   * The contract's deliberate asymmetry: raising a recommendation changes no institutional state, so a rule may
   * raise one about a critical, irreversible act entirely unattended. The alternative is a human never being
   * told, and the risk of the recommended action then gates the *decision* rather than the raising of it.
   */
  it("arms a proposing rule about an act that could never be undone", async () => {
    const rule = await live({
      autonomyMode: "propose_only",
      action: declareAction({
        kind: "raise_recommendation",
        riskLevel: "critical",
        reversibility: "irreversible",
      }),
    });

    expect(rule.status).toBe("active");
  });

  // --- Lifecycle -------------------------------------------------------------------

  it("stops a rule firing without giving it up, and starts it again", async () => {
    const rule = await live();

    expect((await svc.pause(TENANT, rule.id)).status).toBe("paused");
    expect((await svc.activate(TENANT, rule.id)).status).toBe("active");
    expect(types()).toContain("decision.automation_rule.paused");
  });

  it("refuses to pause a rule that is not firing", async () => {
    const rule = await draft();

    await expect(svc.pause(TENANT, rule.id)).rejects.toThrow(InvalidRuleTransitionError);
  });

  it("gives a rule up for good, and refuses to give it up twice", async () => {
    const rule = await live();

    expect((await svc.retire(TENANT, rule.id)).status).toBe("retired");
    await expect(svc.retire(TENANT, rule.id)).rejects.toThrow(InvalidRuleTransitionError);
  });

  /**
   * Deleting something mid-flight is how an institution loses track of what was running, and a retired rule is
   * kept because the firings it produced point at it.
   */
  it("deletes a rule nothing is running and keeps the ones something is", async () => {
    const armed = await live();
    await expect(svc.discard(TENANT, armed.id)).rejects.toThrow(ActiveRuleImmutableError);

    await svc.pause(TENANT, armed.id);
    await svc.discard(TENANT, armed.id);
    await expect(svc.get(TENANT, armed.id)).rejects.toThrow(AutomationRuleNotFoundError);

    const retired = await live({ key: "second-rule" });
    await svc.retire(TENANT, retired.id);
    await expect(svc.discard(TENANT, retired.id)).rejects.toThrow(ActiveRuleImmutableError);
  });

  // --- Reading ---------------------------------------------------------------------

  /** What an administrator asks before arming something, and what the run service asks before firing. */
  it("answers which rules a signal carrying these facts would actually fire", async () => {
    const conditional = await draft();
    await svc.addCondition(
      TENANT,
      conditional.id,
      declareCondition({ key: "consecutive-days", operator: "greater_than", values: ["4"] }),
    );
    await svc.activate(TENANT, conditional.id);
    await draft({ key: "never-armed", name: "Written down and never turned on" });

    expect(await svc.listBySignal(TENANT, SIGNAL)).toHaveLength(1);
    expect(await svc.matching(TENANT, SIGNAL, { "consecutive-days": 5 })).toHaveLength(1);
    expect(await svc.matching(TENANT, SIGNAL, { "consecutive-days": 3 })).toEqual([]);
    expect(await svc.matching(TENANT, SIGNAL, {})).toEqual([]);
    expect(await svc.list(TENANT)).toHaveLength(2);
  });

  it("reads only inside the tenant asked about", async () => {
    const mine = await draft();
    await draft({ tenantId: OTHER });

    expect(await svc.list(TENANT)).toHaveLength(1);
    expect(await svc.list(OTHER)).toHaveLength(1);
    expect((await svc.findByKey(OTHER, "notify-on-fifth-absence"))?.id).not.toBe(mine.id);
    await expect(svc.get(OTHER, mine.id)).rejects.toThrow(AutomationRuleNotFoundError);
  });

  it("404s on a rule that is not there", async () => {
    await expect(svc.get(TENANT, "nobody-1" as Uuid)).rejects.toThrow(AutomationRuleNotFoundError);
    expect(await svc.findByKey(TENANT, "no-such-rule")).toBeNull();
  });

  it("works without an event bus at all", async () => {
    const quiet = new AutomationService({
      repository,
      organizations,
      capabilities: {
        async isInvocable(): Promise<boolean> {
          return true;
        },
      },
    });

    const rule = await quiet.draft({
      tenantId: TENANT,
      organizationId: ORG,
      key: "review-route-on-third-late-arrival",
      name: "Review the transport route after a third late arrival",
      signalKey: "transport.third-late-arrival",
      action: invocation(),
      autonomyMode: "propose_only",
    });

    expect(await quiet.get(TENANT, rule.id)).toEqual(rule);
    expect(published).toEqual([]);
  });
});
