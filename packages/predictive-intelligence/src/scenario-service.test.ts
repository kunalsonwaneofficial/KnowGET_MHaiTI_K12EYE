import { beforeEach, describe, expect, it } from "vitest";

import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateScenarioKeyError,
  EmptyScenarioError,
  InvalidScenarioTransitionError,
  OrganizationNotFoundForForecastError,
  PublishedScenarioImmutableError,
  ScenarioNotFoundError,
} from "./errors";
import { InMemoryScenarioRepository } from "./ports";
import type { LeverInput, Scenario, ScenarioParams } from "./scenario";
import { ScenarioService } from "./scenario-service";

const T1 = "11111111-1111-4111-8111-111111111111" as TenantId;
const T2 = "22222222-2222-4222-8222-222222222222" as TenantId;
const ORG = "33333333-3333-4333-8333-333333333333" as Uuid;
const OTHER_ORG = "44444444-4444-4444-8444-444444444444" as Uuid;
const UNKNOWN_ORG = "77777777-7777-4777-8777-777777777777" as Uuid;
const MISSING = "99999999-9999-4999-8999-999999999999" as Uuid;

const UPLIFT: LeverInput = {
  leverKey: "fee.uplift",
  kind: "multiplicative",
  magnitude: 1.05,
};

describe("ScenarioService", () => {
  let repository: InMemoryScenarioRepository;
  let organizations: Set<string>;
  let published: DomainEvent[];
  let svc: ScenarioService;

  beforeEach(() => {
    repository = new InMemoryScenarioRepository();
    organizations = new Set<string>([ORG, OTHER_ORG]);
    published = [];
    svc = new ScenarioService({
      repository,
      organizations: {
        async exists(_tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
          return organizations.has(organizationId);
        },
      },
      events: {
        async publish(event: DomainEvent): Promise<void> {
          published.push(event);
        },
      },
    });
  });

  const types = (): readonly string[] => published.map((event) => event.type);

  const params = (patch: Partial<ScenarioParams> = {}): ScenarioParams => ({
    tenantId: T1,
    organizationId: ORG,
    scenarioKey: "austerity.case",
    name: "The austerity case",
    levers: [UPLIFT],
    ...patch,
  });

  /** A declared scenario with the announcement already drained. */
  const declared = async (patch: Partial<ScenarioParams> = {}): Promise<Scenario> => {
    const scenario = await svc.declare(params(patch));
    published.length = 0;
    return scenario;
  };

  /** A published scenario with everything it announced on the way already drained. */
  const live = async (patch: Partial<ScenarioParams> = {}): Promise<Scenario> => {
    const scenario = await svc.publish(T1, (await declared(patch)).id);
    published.length = 0;
    return scenario;
  };

  // --- Declaration -----------------------------------------------------------------

  describe("declare", () => {
    it("saves an editable draft and announces it", async () => {
      const scenario = await svc.declare(params());

      expect(scenario.status).toBe("draft");
      expect(scenario.levers).toHaveLength(1);
      expect(await repository.findById(T1, scenario.id)).toEqual(scenario);
      expect(types()).toEqual(["forecast.scenario.declared"]);
    });

    it("refuses an organization that does not exist, writing nothing", async () => {
      await expect(svc.declare(params({ organizationId: UNKNOWN_ORG }))).rejects.toThrow(
        OrganizationNotFoundForForecastError,
      );

      expect(await repository.listByTenant(T1)).toEqual([]);
      expect(published).toEqual([]);
    });

    it("sees through spelling to refuse a key the organization already has", async () => {
      await declared();

      // The clash is judged on the key the aggregate normalized, not on the string that was sent.
      await expect(svc.declare(params({ scenarioKey: "  Austerity.Case  " }))).rejects.toThrow(
        DuplicateScenarioKeyError,
      );

      expect(await repository.listByTenant(T1)).toHaveLength(1);
      expect(published).toEqual([]);
    });

    it("permits the same key in another organization and in another tenant", async () => {
      await declared();

      const elsewhere = await svc.declare(params({ organizationId: OTHER_ORG }));
      const theirs = await svc.declare(params({ tenantId: T2 }));

      expect(elsewhere.scenarioKey).toBe("austerity.case");
      expect(await repository.listByTenant(T1)).toHaveLength(2);
      expect(await repository.listByTenant(T2)).toEqual([theirs]);
    });

    it("restates what a draft says", async () => {
      const scenario = await declared();

      const next = await svc.amend(T1, scenario.id, { name: "The austerity case, as tabled" });

      expect(next.name).toBe("The austerity case, as tabled");
      expect(types()).toEqual(["forecast.scenario.amended"]);
    });

    it("404s on a scenario that is not there", async () => {
      await expect(svc.amend(T1, MISSING, { name: "Nothing" })).rejects.toThrow(
        ScenarioNotFoundError,
      );
    });
  });

  // --- Revision --------------------------------------------------------------------

  describe("revise", () => {
    it("opens a new draft under a new key, carrying the levers and leaving the original alone", async () => {
      const original = await live();

      const revision = await svc.revise(T1, original.id, "austerity.case.march");

      expect(revision.id).not.toBe(original.id);
      expect(revision.scenarioKey).toBe("austerity.case.march");
      expect(revision.status).toBe("draft");
      expect(revision.levers).toHaveLength(1);
      expect(await repository.findById(T1, original.id)).toEqual(original);
      expect(types()).toEqual(["forecast.scenario.declared"]);
    });

    it("refuses a revision whose key is already taken", async () => {
      const original = await live();
      await declared({ scenarioKey: "austerity.case.march", name: "Already claimed" });

      // Revising is declaring, so the same collision arrives by a different route and is refused alike.
      await expect(svc.revise(T1, original.id, "  Austerity.Case.March ")).rejects.toThrow(
        DuplicateScenarioKeyError,
      );

      expect(await repository.listByTenant(T1)).toHaveLength(2);
    });

    it("refuses to revise a draft, which is editable already", async () => {
      const draft = await declared();

      await expect(svc.revise(T1, draft.id, "austerity.case.march")).rejects.toThrow(
        InvalidScenarioTransitionError,
      );
    });
  });

  // --- Levers ----------------------------------------------------------------------

  describe("levers", () => {
    it("adds, restates and removes levers on a draft", async () => {
      const scenario = await declared({ levers: [] });

      const withLevers = await svc.addLevers(T1, scenario.id, [
        UPLIFT,
        { leverKey: "intake.shift", kind: "additive", magnitude: -12 },
      ]);
      expect(withLevers.levers).toHaveLength(2);

      const amended = await svc.amendLever(T1, scenario.id, "fee.uplift", { magnitude: 1.1 });
      expect(amended.levers.find((lever) => lever.leverKey === "fee.uplift")?.magnitude).toBe(1.1);

      const trimmed = await svc.removeLever(T1, scenario.id, "intake.shift");
      expect(trimmed.levers).toHaveLength(1);

      expect(types()).toEqual([
        "forecast.scenario.levers_changed",
        "forecast.scenario.levers_changed",
        "forecast.scenario.levers_changed",
      ]);
    });

    it("refuses to move the levers of a published scenario", async () => {
      const scenario = await live();

      await expect(svc.addLevers(T1, scenario.id, [UPLIFT])).rejects.toThrow(
        PublishedScenarioImmutableError,
      );
    });
  });

  // --- Lifecycle -------------------------------------------------------------------

  describe("publish, archive and discard", () => {
    it("freezes the lever set at publication", async () => {
      const scenario = await declared();

      const next = await svc.publish(T1, scenario.id);

      expect(next.status).toBe("published");
      expect(await svc.listPublished(T1)).toEqual([next]);
      expect(types()).toEqual(["forecast.scenario.published"]);
    });

    it("refuses to publish a scenario that moves nothing", async () => {
      const scenario = await declared({ levers: [] });

      await expect(svc.publish(T1, scenario.id)).rejects.toThrow(EmptyScenarioError);
      expect((await repository.findById(T1, scenario.id))?.status).toBe("draft");
    });

    it("sets a case aside without taking it off the record", async () => {
      const scenario = await live();

      const next = await svc.archive(T1, scenario.id);

      expect(next.status).toBe("archived");
      expect(await svc.listPublished(T1)).toEqual([]);
      expect(await repository.findById(T1, scenario.id)).toEqual(next);
      expect(types()).toEqual(["forecast.scenario.archived"]);
    });

    it("deletes a draft nothing was ever simulated against", async () => {
      const scenario = await declared();

      await svc.discard(T1, scenario.id);

      expect(await repository.findById(T1, scenario.id)).toBeNull();
    });

    it("refuses to delete a scenario a simulation could have pinned", async () => {
      const scenario = await live();

      await expect(svc.discard(T1, scenario.id)).rejects.toThrow(PublishedScenarioImmutableError);
      expect(await repository.findById(T1, scenario.id)).not.toBeNull();
    });
  });

  // --- Reading ---------------------------------------------------------------------

  describe("reads", () => {
    it("finds a scenario by key, by organization, by publication and across the tenant", async () => {
      const standing = await live();
      const draft = await declared({ scenarioKey: "growth.case", name: "The growth case" });

      expect(await svc.get(T1, standing.id)).toEqual(standing);
      expect(await svc.findByKey(T1, ORG, "austerity.case")).toEqual(standing);
      expect(await svc.listByOrganization(T1, ORG)).toHaveLength(2);
      expect(await svc.listPublished(T1)).toEqual([standing]);
      expect((await svc.list(T1)).map((scenario) => scenario.id)).toContain(draft.id);
    });

    it("keeps a scenario out of another tenant's reach", async () => {
      const scenario = await declared();

      await expect(svc.get(T2, scenario.id)).rejects.toThrow(ScenarioNotFoundError);
      expect(await svc.list(T2)).toEqual([]);
      expect(await svc.findByKey(T2, ORG, "austerity.case")).toBeNull();
    });
  });

  // --- Without a bus ---------------------------------------------------------------

  it("works without an event bus", async () => {
    const quiet = new ScenarioService({
      repository,
      organizations: {
        async exists(): Promise<boolean> {
          return true;
        },
      },
    });

    const scenario = await quiet.declare(params());

    expect(await repository.findById(T1, scenario.id)).toEqual(scenario);
    expect(published).toEqual([]);
  });
});
