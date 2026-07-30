import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type ApiConsumer, registerApiConsumer } from "./api-consumer";
import {
  ApiConsumerNotFoundError,
  BurstBelowLimitError,
  DuplicatePolicyScopeError,
  EmptyTrafficPolicyError,
  IncompleteRateLimitError,
  InvalidPolicyLimitError,
  OrganizationNotFoundForGatewayError,
  PolicyScopeMismatchError,
  TrafficPolicyNotFoundError,
} from "./errors";
import {
  POLICY_DEACTIVATED,
  POLICY_DEFINED,
  POLICY_REACTIVATED,
  POLICY_REVISED,
} from "./gateway-events";
import type { PolicyLimits } from "./gateway-view";
import {
  InMemoryApiConsumerRepository,
  InMemoryTrafficPolicyRepository,
  type OrganizationDirectory,
} from "./ports";
import type { DefineTrafficPolicyParams } from "./traffic-policy";
import { TrafficPolicyService } from "./traffic-policy-service";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const ABSENT_ORG = "org-absent" as Uuid;
const OWNER = "person-1" as Uuid;
const ABSENT_CONSUMER = "consumer-absent" as Uuid;
const MISSING = "policy-absent" as Uuid;

const CAPABILITY = "admissions.applications";
const OTHER_CAPABILITY = "finance.invoices";

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

const organizations: OrganizationDirectory = {
  exists: async (_tenantId, organizationId) => organizationId !== ABSENT_ORG,
};

const limits = (overrides: Partial<PolicyLimits> = {}): PolicyLimits => ({
  requestsPerWindow: 600,
  window: "minute",
  burstAllowance: 900,
  maxPayloadBytes: 1_048_576,
  timeoutMs: 30_000,
  ...overrides,
});

const consumer = (overrides: Partial<{ consumerKey: string; tenantId: TenantId }> = {}) =>
  registerApiConsumer({
    tenantId: overrides.tenantId ?? TENANT,
    organizationId: ORG,
    consumerKey: overrides.consumerKey ?? "sis.nightly-sync",
    displayName: "Nightly SIS Sync",
    authScheme: "api_key",
    credentialRef: "vault:gateway/consumers/sis-nightly-sync",
    grantedScopes: [`${CAPABILITY}.read`],
    ownerId: OWNER,
    registeredBy: OWNER,
  });

const harness = async () => {
  const repository = new InMemoryTrafficPolicyRepository();
  const consumers = new InMemoryApiConsumerRepository();
  const events = recorder();
  const service = new TrafficPolicyService({ repository, organizations, consumers, events });
  const subject = consumer();
  await consumers.save(subject);
  return { repository, consumers, events, service, subject };
};

const params = (overrides: Partial<DefineTrafficPolicyParams> = {}): DefineTrafficPolicyParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  scope: "global",
  consumerId: null,
  capabilityKey: null,
  displayName: "Everything, everybody",
  limits: limits(),
  ...overrides,
});

/** The scope a policy carries, paired with the subject fields that scope requires. */
const forConsumer = (subject: ApiConsumer): Partial<DefineTrafficPolicyParams> => ({
  scope: "consumer",
  consumerId: subject.id,
  capabilityKey: null,
});

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("TrafficPolicyService — definition", () => {
  it("defines a policy already in force, storing it and announcing it", async () => {
    const { repository, events, service } = await harness();

    const policy = await service.define(params());

    expect(policy.active).toBe(true);
    expect(policy.deactivatedAt).toBeNull();
    expect(await repository.findById(TENANT, policy.id)).toEqual(policy);
    expect(types(events)).toEqual([POLICY_DEFINED]);
  });

  it("refuses an institution the tenant does not have", async () => {
    const { repository, events, service } = await harness();

    await expect(service.define(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForGatewayError,
    );
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses a per-consumer policy naming a consumer that resolves to nobody", async () => {
    const { repository, service } = await harness();

    await expect(
      service.define(params({ scope: "consumer", consumerId: ABSENT_CONSUMER })),
    ).rejects.toThrow(ApiConsumerNotFoundError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("checks the consumer against the tenant that owns the policy, not against any tenant", async () => {
    const { consumers, service } = await harness();
    const elsewhere = consumer({ tenantId: OTHER, consumerKey: "sis.other-tenant" });
    await consumers.save(elsewhere);

    await expect(
      service.define(params({ scope: "consumer", consumerId: elsewhere.id })),
    ).rejects.toThrow(ApiConsumerNotFoundError);
  });

  it("accepts a policy for a consumer the institution has registered", async () => {
    const { service, subject } = await harness();

    const policy = await service.define(params(forConsumer(subject)));

    expect(policy.scope).toBe("consumer");
    expect(policy.consumerId).toBe(subject.id);
    expect(policy.capabilityKey).toBeNull();
  });

  it("does not check a capability key against the contract register, so limits can be set first", async () => {
    const { service } = await harness();

    const policy = await service.define(
      params({ scope: "capability", capabilityKey: "admissions.not-yet-shipped" }),
    );

    expect(policy.capabilityKey).toBe("admissions.not-yet-shipped");
  });

  it("refuses a scope and a subject that disagree, in either direction", async () => {
    const { service, subject } = await harness();

    await expect(service.define(params({ scope: "consumer" }))).rejects.toThrow(
      PolicyScopeMismatchError,
    );
    await expect(service.define(params({ consumerId: subject.id }))).rejects.toThrow(
      PolicyScopeMismatchError,
    );
  });

  it("settles the shape of the policy before it asks the directory anything", async () => {
    const { service } = await harness();

    await expect(
      service.define(params({ organizationId: ABSENT_ORG, scope: "consumer" })),
    ).rejects.toThrow(PolicyScopeMismatchError);
  });

  it("refuses limits that could not be enforced as written", async () => {
    const { service } = await harness();

    await expect(
      service.define(params({ limits: limits({ requestsPerWindow: 0 }) })),
    ).rejects.toThrow(InvalidPolicyLimitError);
    await expect(service.define(params({ limits: limits({ window: null }) }))).rejects.toThrow(
      IncompleteRateLimitError,
    );
    await expect(
      service.define(params({ limits: limits({ burstAllowance: 100 }) })),
    ).rejects.toThrow(BurstBelowLimitError);
    await expect(
      service.define(
        params({
          limits: {
            requestsPerWindow: null,
            window: null,
            burstAllowance: null,
            maxPayloadBytes: null,
            timeoutMs: null,
          },
        }),
      ),
    ).rejects.toThrow(EmptyTrafficPolicyError);
  });
});

describe("TrafficPolicyService — one policy in force per tuple", () => {
  it("refuses a second policy on a tuple another policy in force already holds", async () => {
    const { repository, service } = await harness();
    await service.define(params());

    await expect(service.define(params({ displayName: "Also everything" }))).rejects.toThrow(
      DuplicatePolicyScopeError,
    );
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("names the tuple an operator would search for, not the row that got there first", async () => {
    const { service, subject } = await harness();
    await service.define(params(forConsumer(subject)));

    await expect(service.define(params(forConsumer(subject)))).rejects.toThrow(
      new RegExp(`consumer "${subject.id}"`),
    );
  });

  it("distinguishes tuples that differ only in the capability", async () => {
    const { service, subject } = await harness();

    const first = await service.define(
      params({ scope: "consumer_capability", consumerId: subject.id, capabilityKey: CAPABILITY }),
    );
    const second = await service.define(
      params({
        scope: "consumer_capability",
        consumerId: subject.id,
        capabilityKey: OTHER_CAPABILITY,
      }),
    );

    expect(second.id).not.toBe(first.id);
  });

  it("distinguishes tuples that differ only in the institution", async () => {
    const { service } = await harness();
    await service.define(params());

    const second = await service.define(params({ organizationId: SECOND_ORG }));

    expect(second.organizationId).toBe(SECOND_ORG);
  });

  it("lets a policy out of force hold no tuple, so a replacement can take it", async () => {
    const { service } = await harness();
    const first = await service.define(params());
    await service.deactivate(TENANT, first.id);

    const replacement = await service.define(params({ displayName: "The replacement" }));

    expect(replacement.active).toBe(true);
    expect(replacement.id).not.toBe(first.id);
  });

  it("still refuses a third policy once a released one shares the tuple's history", async () => {
    const { repository, service } = await harness();
    const released = await service.define(params());
    await service.deactivate(TENANT, released.id);
    await service.define(params({ displayName: "The replacement" }));

    await expect(service.define(params({ displayName: "One too many" }))).rejects.toThrow(
      DuplicatePolicyScopeError,
    );
    expect(await repository.listActive(TENANT, ORG)).toHaveLength(1);
  });
});

describe("TrafficPolicyService — revision", () => {
  it("replaces the limits wholesale and announces the new ceiling", async () => {
    const { repository, events, service } = await harness();
    const policy = await service.define(params());

    const revised = await service.revise(
      TENANT,
      policy.id,
      limits({ requestsPerWindow: 60, burstAllowance: null }),
    );

    expect(revised.limits.requestsPerWindow).toBe(60);
    expect(revised.limits.burstAllowance).toBeNull();
    expect(await repository.findById(TENANT, policy.id)).toEqual(revised);
    expect(types(events)).toEqual([POLICY_DEFINED, POLICY_REVISED]);
  });

  it("leaves the scope and the subject where resolution finds them", async () => {
    const { service, subject } = await harness();
    const policy = await service.define(params(forConsumer(subject)));

    const revised = await service.revise(TENANT, policy.id, limits({ timeoutMs: 5_000 }));

    expect(revised.scope).toBe("consumer");
    expect(revised.consumerId).toBe(subject.id);
  });

  it("refuses limits that could not be enforced, leaving the stored ceiling alone", async () => {
    const { repository, service } = await harness();
    const policy = await service.define(params());

    await expect(service.revise(TENANT, policy.id, limits({ burstAllowance: 1 }))).rejects.toThrow(
      BurstBelowLimitError,
    );
    expect(await repository.findById(TENANT, policy.id)).toEqual(policy);
  });

  it("changes the label without announcing anything, because a label is not a ceiling", async () => {
    const { repository, events, service } = await harness();
    const policy = await service.define(params());

    const renamed = await service.rename(TENANT, policy.id, "  Trial tier  ");

    expect(renamed.displayName).toBe("Trial tier");
    expect(renamed.limits).toEqual(policy.limits);
    expect(await repository.findById(TENANT, policy.id)).toEqual(renamed);
    expect(types(events)).toEqual([POLICY_DEFINED]);
  });

  it("404s on revising or renaming a policy the tenant does not have", async () => {
    const { service } = await harness();

    await expect(service.revise(TENANT, MISSING, limits())).rejects.toThrow(
      TrafficPolicyNotFoundError,
    );
    await expect(service.rename(TENANT, MISSING, "x")).rejects.toThrow(TrafficPolicyNotFoundError);
  });
});

describe("TrafficPolicyService — force", () => {
  it("takes a policy out of force, keeping the record and stamping the absence", async () => {
    const { repository, events, service } = await harness();
    const policy = await service.define(params());

    const off = await service.deactivate(TENANT, policy.id);

    expect(off.active).toBe(false);
    expect(off.deactivatedAt).not.toBeNull();
    expect(await repository.findById(TENANT, policy.id)).toEqual(off);
    expect(types(events)).toEqual([POLICY_DEFINED, POLICY_DEACTIVATED]);
  });

  it("treats a repeated deactivation as done rather than as an error", async () => {
    const { events, service } = await harness();
    const policy = await service.define(params());
    const off = await service.deactivate(TENANT, policy.id);

    const again = await service.deactivate(TENANT, policy.id);

    expect(again).toEqual(off);
    expect(types(events)).toEqual([POLICY_DEFINED, POLICY_DEACTIVATED]);
  });

  it("announces nothing on a repeat, because nothing went out of force twice", async () => {
    const { events, service } = await harness();
    const policy = await service.define(params());
    await service.deactivate(TENANT, policy.id);
    await service.deactivate(TENANT, policy.id);
    await service.deactivate(TENANT, policy.id);

    expect(events.published.filter((event) => event.type === POLICY_DEACTIVATED)).toHaveLength(1);
  });

  it("puts a policy back in force and clears the absence", async () => {
    const { events, service } = await harness();
    const policy = await service.define(params());
    await service.deactivate(TENANT, policy.id);

    const back = await service.reactivate(TENANT, policy.id);

    expect(back.active).toBe(true);
    expect(back.deactivatedAt).toBeNull();
    expect(types(events)).toEqual([POLICY_DEFINED, POLICY_DEACTIVATED, POLICY_REACTIVATED]);
  });

  it("re-checks the tuple on the way back in, because a replacement may hold it now", async () => {
    const { service } = await harness();
    const original = await service.define(params());
    await service.deactivate(TENANT, original.id);
    await service.define(params({ displayName: "The replacement" }));

    await expect(service.reactivate(TENANT, original.id)).rejects.toThrow(
      DuplicatePolicyScopeError,
    );
  });

  it("leaves the policy out of force when the tuple is taken", async () => {
    const { repository, service } = await harness();
    const original = await service.define(params());
    await service.deactivate(TENANT, original.id);
    await service.define(params({ displayName: "The replacement" }));

    await expect(service.reactivate(TENANT, original.id)).rejects.toThrow(
      DuplicatePolicyScopeError,
    );
    const stored = await repository.findById(TENANT, original.id);
    expect(stored?.active).toBe(false);
  });

  it("returns a policy already in force untouched, without running the tuple check", async () => {
    const { events, service } = await harness();
    const policy = await service.define(params());

    const again = await service.reactivate(TENANT, policy.id);

    expect(again).toEqual(policy);
    expect(types(events)).toEqual([POLICY_DEFINED]);
  });

  it("404s on taking a policy the tenant does not have in or out of force", async () => {
    const { service } = await harness();

    await expect(service.deactivate(TENANT, MISSING)).rejects.toThrow(TrafficPolicyNotFoundError);
    await expect(service.reactivate(TENANT, MISSING)).rejects.toThrow(TrafficPolicyNotFoundError);
  });
});

describe("TrafficPolicyService — reading", () => {
  it("returns one policy, or 404s naming the id asked for", async () => {
    const { service } = await harness();
    const policy = await service.define(params());

    expect(await service.get(TENANT, policy.id)).toEqual(policy);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(MISSING);
  });

  it("refuses to read a policy across the tenant boundary", async () => {
    const { service } = await harness();
    const policy = await service.define(params());

    await expect(service.get(OTHER, policy.id)).rejects.toThrow(TrafficPolicyNotFoundError);
  });

  it("offers the candidate set for one institution, excluding what is out of force", async () => {
    const { service, subject } = await harness();
    const global = await service.define(params());
    const perConsumer = await service.define(params(forConsumer(subject)));
    const elsewhere = await service.define(params({ organizationId: SECOND_ORG }));
    await service.deactivate(TENANT, perConsumer.id);

    const active = await service.listActive(TENANT, ORG);

    expect(active.map((policy) => policy.id)).toEqual([global.id]);
    expect(active.map((policy) => policy.id)).not.toContain(elsewhere.id);
  });

  it("excludes a deactivated policy by the read rather than leaving the engine to filter", async () => {
    const { service } = await harness();
    const policy = await service.define(params());
    await service.deactivate(TENANT, policy.id);

    expect(await service.listActive(TENANT, ORG)).toEqual([]);
    expect(await service.list(TENANT)).toHaveLength(1);
  });

  it("lists every policy in the tenant across institutions", async () => {
    const { service } = await harness();
    await service.define(params());
    await service.define(params({ organizationId: SECOND_ORG }));

    expect(await service.list(TENANT)).toHaveLength(2);
    expect(await service.list(OTHER)).toEqual([]);
  });
});
