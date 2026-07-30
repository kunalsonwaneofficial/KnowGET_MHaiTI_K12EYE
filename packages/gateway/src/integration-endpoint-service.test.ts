import { describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateEndpointKeyError,
  EmptyGatewayKeyError,
  EndpointRetiredError,
  IntegrationEndpointNotFoundError,
  InvalidEndpointProgressionError,
  OrganizationNotFoundForGatewayError,
  UnknownAdapterError,
} from "./errors";
import {
  ENDPOINT_ACTIVATED,
  ENDPOINT_CIRCUIT_CLOSED,
  ENDPOINT_CIRCUIT_OPENED,
  ENDPOINT_DISABLED,
  ENDPOINT_QUARANTINED,
  ENDPOINT_REGISTERED,
  ENDPOINT_RETIRED,
} from "./gateway-events";
import {
  CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD,
  CIRCUIT_HALF_OPEN_SUCCESSES,
  CIRCUIT_PROBE_AFTER_SECONDS,
  CIRCUIT_QUARANTINE_AFTER_SECONDS,
} from "./gateway-value";
import type { OutcomeWindow } from "./gateway-view";
import type {
  IntegrationEndpoint,
  RegisterIntegrationEndpointParams,
} from "./integration-endpoint";
import { IntegrationEndpointService } from "./integration-endpoint-service";
import {
  type AdapterRegistry,
  InMemoryIntegrationEndpointRepository,
  type OrganizationDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const ABSENT_ORG = "org-absent" as Uuid;
const MISSING = "endpoint-absent" as Uuid;

const KEY = "payments.razorpay";
const OTHER_KEY = "payments.stripe";
const ADAPTER = "razorpay-v3";
const OTHER_ADAPTER = "razorpay-v4";
const UNREGISTERED_ADAPTER = "razorpay-v9";
/** Registered, and speaks SFTP alone — the adapter that makes a protocol mismatch reachable. */
const SFTP_ADAPTER = "bank-statement-drop";

/** Seconds from an instant the record itself carries, so no assertion here depends on the wall clock. */
const shift = (from: ISODateString, seconds: number): ISODateString =>
  new Date(Date.parse(from) + seconds * 1_000).toISOString() as ISODateString;

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

/** Two adapters speak https, one speaks sftp alone, and one is not registered at all. */
const adapters: AdapterRegistry = {
  supports: async (adapterKey, protocol) => {
    if (adapterKey === SFTP_ADAPTER) return protocol === "sftp";
    if (adapterKey === ADAPTER || adapterKey === OTHER_ADAPTER) return protocol === "https";
    return false;
  },
};

const harness = () => {
  const repository = new InMemoryIntegrationEndpointRepository();
  const events = recorder();
  const service = new IntegrationEndpointService({ repository, organizations, adapters, events });
  return { repository, events, service };
};

const params = (
  overrides: Partial<RegisterIntegrationEndpointParams> = {},
): RegisterIntegrationEndpointParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  endpointKey: KEY,
  displayName: "Razorpay Payments",
  protocol: "https",
  adapterKey: ADAPTER,
  credentialRef: "vault:gateway/endpoints/razorpay",
  ...overrides,
});

/**
 * Register an endpoint and put it into service, which is the precondition of every circuit test below.
 *
 * Activation reads the tenant off the endpoint that came back rather than closing over the default, so that a
 * test overriding the tenant gets a live endpoint in *that* tenant instead of a lookup miss in this one.
 */
const live = async (
  service: IntegrationEndpointService,
  overrides: Partial<RegisterIntegrationEndpointParams> = {},
): Promise<IntegrationEndpoint> => {
  const endpoint = await service.register(params(overrides));
  return service.activate(endpoint.tenantId, endpoint.id);
};

/** A window of outcomes measured from the endpoint's own posture stamp. */
const window = (
  endpoint: IntegrationEndpoint,
  overrides: Partial<OutcomeWindow> = {},
): OutcomeWindow => ({
  successes: 10,
  failures: 0,
  consecutiveFailures: 0,
  posture: endpoint.posture,
  postureSince: endpoint.postureSince,
  asOf: shift(endpoint.postureSince, 30),
  ...overrides,
});

/** Enough consecutive failures to open the circuit, whatever the ratio says. */
const failing = (endpoint: IntegrationEndpoint, overrides: Partial<OutcomeWindow> = {}) =>
  window(endpoint, {
    successes: 0,
    failures: CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD,
    consecutiveFailures: CIRCUIT_CONSECUTIVE_FAILURE_THRESHOLD,
    ...overrides,
  });

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("IntegrationEndpointService — registration", () => {
  it("registers an endpoint nothing will call yet, storing it and announcing it", async () => {
    const { repository, events, service } = harness();

    const endpoint = await service.register(params());

    expect(endpoint.status).toBe("registered");
    expect(endpoint.health).toBe("unknown");
    expect(endpoint.posture).toBe("closed");
    expect(endpoint.activatedAt).toBeNull();
    expect(await repository.findById(TENANT, endpoint.id)).toEqual(endpoint);
    expect(types(events)).toEqual([ENDPOINT_REGISTERED]);
  });

  it("refuses an institution the tenant does not have", async () => {
    const { repository, events, service } = harness();

    await expect(service.register(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForGatewayError,
    );
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses an adapter nobody built", async () => {
    const { repository, service } = harness();

    await expect(service.register(params({ adapterKey: UNREGISTERED_ADAPTER }))).rejects.toThrow(
      UnknownAdapterError,
    );
    expect(await repository.listByTenant(TENANT)).toEqual([]);
  });

  it("refuses a real adapter named under a protocol it does not speak", async () => {
    const { service } = harness();

    await expect(service.register(params({ adapterKey: SFTP_ADAPTER }))).rejects.toThrow(
      UnknownAdapterError,
    );
  });

  it("accepts the same adapter under the protocol it does speak", async () => {
    const { service } = harness();

    const endpoint = await service.register(
      params({
        endpointKey: "finance.bank-statements",
        protocol: "sftp",
        adapterKey: SFTP_ADAPTER,
      }),
    );

    expect(endpoint.protocol).toBe("sftp");
    expect(endpoint.adapterKey).toBe(SFTP_ADAPTER);
  });

  it("names the adapter and the protocol together in the refusal", async () => {
    const { service } = harness();

    await expect(service.register(params({ adapterKey: SFTP_ADAPTER }))).rejects.toThrow(
      new RegExp(`${SFTP_ADAPTER}[\\s\\S]*https|https[\\s\\S]*${SFTP_ADAPTER}`),
    );
  });

  it("takes the endpoint key once tenant-wide rather than once per school", async () => {
    const { repository, service } = harness();
    await service.register(params());

    await expect(service.register(params({ organizationId: SECOND_ORG }))).rejects.toThrow(
      DuplicateEndpointKeyError,
    );
    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
  });

  it("keeps the key free in another tenant", async () => {
    const { service } = harness();
    await service.register(params());

    const elsewhere = await service.register(params({ tenantId: OTHER }));

    expect(elsewhere.endpointKey).toBe(KEY);
  });

  it("keeps a retired endpoint's key taken, because deliveries still name it", async () => {
    const { service } = harness();
    const endpoint = await service.register(params());
    await service.retire(TENANT, endpoint.id);

    await expect(service.register(params())).rejects.toThrow(DuplicateEndpointKeyError);
  });

  it("settles the shape of the endpoint before it asks anything else", async () => {
    const { service } = harness();

    await expect(
      service.register(params({ endpointKey: "  ", organizationId: ABSENT_ORG })),
    ).rejects.toThrow(EmptyGatewayKeyError);
  });

  it("registers an endpoint that needs no credential, as an explicit null", async () => {
    const { service } = harness();

    const endpoint = await service.register(params({ credentialRef: null }));

    expect(endpoint.credentialRef).toBeNull();
  });
});

describe("IntegrationEndpointService — revision", () => {
  it("changes the label without announcing anything", async () => {
    const { repository, events, service } = harness();
    const endpoint = await service.register(params());

    const renamed = await service.rename(TENANT, endpoint.id, "  Razorpay (production)  ");

    expect(renamed.displayName).toBe("Razorpay (production)");
    expect(await repository.findById(TENANT, endpoint.id)).toEqual(renamed);
    expect(types(events)).toEqual([ENDPOINT_REGISTERED]);
  });

  it("moves the endpoint onto another adapter without changing what refers to it", async () => {
    const { events, service } = harness();
    const endpoint = await service.register(params());

    const rebound = await service.rebindAdapter(TENANT, endpoint.id, OTHER_ADAPTER);

    expect(rebound.adapterKey).toBe(OTHER_ADAPTER);
    expect(rebound.endpointKey).toBe(endpoint.endpointKey);
    expect(rebound.protocol).toBe(endpoint.protocol);
    expect(types(events)).toEqual([ENDPOINT_REGISTERED]);
  });

  it("re-checks the protocol on a rebind, because the protocol does not move with the adapter", async () => {
    const { repository, service } = harness();
    const endpoint = await service.register(params());

    await expect(service.rebindAdapter(TENANT, endpoint.id, SFTP_ADAPTER)).rejects.toThrow(
      UnknownAdapterError,
    );
    const stored = await repository.findById(TENANT, endpoint.id);
    expect(stored?.adapterKey).toBe(ADAPTER);
  });

  it("rebinds a live endpoint, which is what the indirection is for", async () => {
    const { service } = harness();
    const endpoint = await live(service);

    const rebound = await service.rebindAdapter(TENANT, endpoint.id, OTHER_ADAPTER);

    expect(rebound.status).toBe("active");
    expect(rebound.adapterKey).toBe(OTHER_ADAPTER);
  });

  it("points the endpoint at another secret, or at none, and announces neither", async () => {
    const { events, service } = harness();
    const endpoint = await service.register(params());

    const rotated = await service.rotateCredential(
      TENANT,
      endpoint.id,
      "vault:gateway/endpoints/razorpay-2027",
    );
    const cleared = await service.rotateCredential(TENANT, endpoint.id, null);

    expect(rotated.credentialRef).toBe("vault:gateway/endpoints/razorpay-2027");
    expect(cleared.credentialRef).toBeNull();
    expect(types(events)).toEqual([ENDPOINT_REGISTERED]);
  });

  it("refuses to revise anything about a retired endpoint", async () => {
    const { service } = harness();
    const endpoint = await service.register(params());
    await service.retire(TENANT, endpoint.id);

    await expect(service.rename(TENANT, endpoint.id, "x")).rejects.toThrow(EndpointRetiredError);
    await expect(service.rebindAdapter(TENANT, endpoint.id, OTHER_ADAPTER)).rejects.toThrow(
      EndpointRetiredError,
    );
    await expect(service.rotateCredential(TENANT, endpoint.id, null)).rejects.toThrow(
      EndpointRetiredError,
    );
  });

  it("404s on revising an endpoint the tenant does not have", async () => {
    const { service } = harness();

    await expect(service.rename(TENANT, MISSING, "x")).rejects.toThrow(
      IntegrationEndpointNotFoundError,
    );
    await expect(service.rebindAdapter(TENANT, MISSING, ADAPTER)).rejects.toThrow(
      IntegrationEndpointNotFoundError,
    );
    await expect(service.rotateCredential(TENANT, MISSING, null)).rejects.toThrow(
      IntegrationEndpointNotFoundError,
    );
  });
});

describe("IntegrationEndpointService — lifecycle", () => {
  it("puts the endpoint into service and announces it", async () => {
    const { repository, events, service } = harness();
    const endpoint = await service.register(params());

    const active = await service.activate(TENANT, endpoint.id);

    expect(active.status).toBe("active");
    expect(active.activatedAt).not.toBeNull();
    expect(await repository.listCallable(TENANT, ORG)).toEqual([active]);
    expect(types(events)).toEqual([ENDPOINT_REGISTERED, ENDPOINT_ACTIVATED]);
  });

  it("clears the last outage on the way back in", async () => {
    const { service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));
    await service.quarantine(TENANT, endpoint.id);

    const back = await service.activate(TENANT, endpoint.id);

    expect(opened.posture).toBe("open");
    expect(back.posture).toBe("closed");
    expect(back.consecutiveFailures).toBe(0);
    expect(back.circuitOpenedAt).toBeNull();
    expect(back.quarantinedAt).toBeNull();
  });

  it("stops calling a failing endpoint and keeps the health that justified it", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);
    await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));

    const held = await service.quarantine(TENANT, endpoint.id);

    expect(held.status).toBe("quarantined");
    expect(held.health).toBe("unreachable");
    expect(held.quarantinedAt).not.toBeNull();
    expect(types(events)).toContain(ENDPOINT_QUARANTINED);
  });

  it("takes an endpoint out of service with a reason that stays on the record", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);

    const off = await service.disable(TENANT, endpoint.id, "  vendor contract lapsed  ");

    expect(off.status).toBe("disabled");
    expect(off.disabledReason).toBe("vendor contract lapsed");
    expect(types(events)).toContain(ENDPOINT_DISABLED);
  });

  it("refuses a disablement with no reason attached", async () => {
    const { service } = harness();
    const endpoint = await live(service);

    await expect(service.disable(TENANT, endpoint.id, "   ")).rejects.toThrow(EmptyGatewayKeyError);
  });

  it("ends the integration and keeps the record readable", async () => {
    const { repository, events, service } = harness();
    const endpoint = await live(service);

    const gone = await service.retire(TENANT, endpoint.id);

    expect(gone.status).toBe("retired");
    expect(await repository.findById(TENANT, endpoint.id)).toEqual(gone);
    expect(await repository.listCallable(TENANT, ORG)).toEqual([]);
    expect(types(events)).toContain(ENDPOINT_RETIRED);
  });

  it("lets nothing out of retirement", async () => {
    const { service } = harness();
    const endpoint = await live(service);
    await service.retire(TENANT, endpoint.id);

    await expect(service.activate(TENANT, endpoint.id)).rejects.toThrow(EndpointRetiredError);
    await expect(service.quarantine(TENANT, endpoint.id)).rejects.toThrow(EndpointRetiredError);
    await expect(service.disable(TENANT, endpoint.id, "why")).rejects.toThrow(EndpointRetiredError);
  });

  it("refuses a conclusion about traffic it never sent", async () => {
    const { service } = harness();
    const endpoint = await service.register(params());

    await expect(service.quarantine(TENANT, endpoint.id)).rejects.toThrow(
      InvalidEndpointProgressionError,
    );
  });

  it("404s on moving an endpoint the tenant does not have", async () => {
    const { service } = harness();

    await expect(service.activate(TENANT, MISSING)).rejects.toThrow(
      IntegrationEndpointNotFoundError,
    );
    await expect(service.retire(TENANT, MISSING)).rejects.toThrow(IntegrationEndpointNotFoundError);
  });
});

describe("IntegrationEndpointService — observation", () => {
  it("records what a window showed without being told a posture", async () => {
    const { repository, service } = harness();
    const endpoint = await live(service);

    const seen = await service.recordOutcomes(TENANT, endpoint.id, window(endpoint));

    expect(seen.health).toBe("healthy");
    expect(seen.posture).toBe("closed");
    expect(seen.lastOutcomeAt).toBe(shift(endpoint.postureSince, 30));
    expect(await repository.findById(TENANT, endpoint.id)).toEqual(seen);
  });

  it("leaves the last-heard-from stamp alone when nothing was observed", async () => {
    const { service } = harness();
    const endpoint = await live(service);
    const heard = await service.recordOutcomes(TENANT, endpoint.id, window(endpoint));

    const quiet = await service.recordOutcomes(
      TENANT,
      endpoint.id,
      window(heard, { successes: 0, failures: 0, asOf: shift(heard.postureSince, 600) }),
    );

    expect(quiet.lastOutcomeAt).toBe(heard.lastOutcomeAt);
    expect(quiet.health).toBe("unknown");
  });

  it("announces the crossing out of closed, once", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);

    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));

    expect(opened.posture).toBe("open");
    expect(opened.circuitOpenedAt).not.toBeNull();
    expect(types(events)).toEqual([
      ENDPOINT_REGISTERED,
      ENDPOINT_ACTIVATED,
      ENDPOINT_CIRCUIT_OPENED,
    ]);
  });

  it("says nothing while an open circuit flaps through its probe cycle", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));

    const probing = await service.recordOutcomes(
      TENANT,
      endpoint.id,
      window(opened, {
        successes: 0,
        failures: 0,
        asOf: shift(opened.postureSince, CIRCUIT_PROBE_AFTER_SECONDS),
      }),
    );
    const reopened = await service.recordOutcomes(
      TENANT,
      endpoint.id,
      window(probing, { successes: 0, failures: 1, consecutiveFailures: 1 }),
    );

    expect(probing.posture).toBe("half_open");
    expect(reopened.posture).toBe("open");
    expect(events.published.filter((event) => event.type === ENDPOINT_CIRCUIT_OPENED)).toHaveLength(
      1,
    );
    expect(events.published.filter((event) => event.type === ENDPOINT_CIRCUIT_CLOSED)).toEqual([]);
  });

  it("announces the crossing back, once, when the probe succeeds", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));
    const probing = await service.recordOutcomes(
      TENANT,
      endpoint.id,
      window(opened, {
        successes: 0,
        failures: 0,
        asOf: shift(opened.postureSince, CIRCUIT_PROBE_AFTER_SECONDS),
      }),
    );

    const recovered = await service.recordOutcomes(
      TENANT,
      endpoint.id,
      window(probing, { successes: CIRCUIT_HALF_OPEN_SUCCESSES, failures: 0 }),
    );

    expect(recovered.posture).toBe("closed");
    expect(recovered.circuitOpenedAt).toBeNull();
    expect(types(events)).toEqual([
      ENDPOINT_REGISTERED,
      ENDPOINT_ACTIVATED,
      ENDPOINT_CIRCUIT_OPENED,
      ENDPOINT_CIRCUIT_CLOSED,
    ]);
  });

  it("keeps the outage clock through the probe cycle that resets the posture stamp", async () => {
    const { service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));

    const probing = await service.recordOutcomes(
      TENANT,
      endpoint.id,
      window(opened, {
        successes: 0,
        failures: 0,
        asOf: shift(opened.postureSince, CIRCUIT_PROBE_AFTER_SECONDS),
      }),
    );

    expect(probing.postureSince).not.toBe(opened.postureSince);
    expect(probing.circuitOpenedAt).toBe(opened.circuitOpenedAt);
  });

  it("404s on recording outcomes against an endpoint the tenant does not have", async () => {
    const { service } = harness();
    const endpoint = await live(service);

    await expect(service.recordOutcomes(OTHER, endpoint.id, window(endpoint))).rejects.toThrow(
      IntegrationEndpointNotFoundError,
    );
  });
});

describe("IntegrationEndpointService — the quarantine sweep", () => {
  it("quarantines an endpoint that has been open long enough, and announces each one", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));
    const due = shift(
      opened.circuitOpenedAt ?? opened.postureSince,
      CIRCUIT_QUARANTINE_AFTER_SECONDS,
    );

    const swept = await service.sweepQuarantine(TENANT, due);

    expect(swept).toHaveLength(1);
    expect(swept[0]?.status).toBe("quarantined");
    expect(types(events)).toContain(ENDPOINT_QUARANTINED);
  });

  it("leaves an endpoint open but not yet due exactly as it was, and says nothing", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));
    const tooEarly = shift(
      opened.circuitOpenedAt ?? opened.postureSince,
      CIRCUIT_QUARANTINE_AFTER_SECONDS - 1,
    );

    const swept = await service.sweepQuarantine(TENANT, tooEarly);

    expect(swept).toEqual([]);
    expect(types(events)).not.toContain(ENDPOINT_QUARANTINED);
  });

  it("returns what it quarantined rather than a count, because a job's log is the only record", async () => {
    const { service } = harness();
    const first = await live(service);
    const second = await live(service, { endpointKey: OTHER_KEY, displayName: "Stripe" });
    const openedFirst = await service.recordOutcomes(TENANT, first.id, failing(first));
    await service.recordOutcomes(TENANT, second.id, failing(second));
    const due = shift(
      openedFirst.circuitOpenedAt ?? openedFirst.postureSince,
      CIRCUIT_QUARANTINE_AFTER_SECONDS,
    );

    const swept = await service.sweepQuarantine(TENANT, due);

    expect(swept.map((endpoint) => endpoint.endpointKey).sort()).toEqual([KEY, OTHER_KEY]);
  });

  it("passes over an endpoint already quarantined, so a repeat sweep does nothing", async () => {
    const { events, service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));
    const due = shift(
      opened.circuitOpenedAt ?? opened.postureSince,
      CIRCUIT_QUARANTINE_AFTER_SECONDS,
    );
    await service.sweepQuarantine(TENANT, due);

    const again = await service.sweepQuarantine(TENANT, due);

    expect(again).toEqual([]);
    expect(events.published.filter((event) => event.type === ENDPOINT_QUARANTINED)).toHaveLength(1);
  });

  it("passes over a disabled endpoint, because nobody caused its failures", async () => {
    const { service } = harness();
    const endpoint = await live(service);
    const opened = await service.recordOutcomes(TENANT, endpoint.id, failing(endpoint));
    await service.disable(TENANT, endpoint.id, "vendor migration");
    const due = shift(
      opened.circuitOpenedAt ?? opened.postureSince,
      CIRCUIT_QUARANTINE_AFTER_SECONDS,
    );

    expect(await service.sweepQuarantine(TENANT, due)).toEqual([]);
  });

  it("sweeps one tenant without reaching into another", async () => {
    const { service } = harness();
    const mine = await live(service);
    const theirs = await live(service, { tenantId: OTHER });
    const openedMine = await service.recordOutcomes(TENANT, mine.id, failing(mine));
    await service.recordOutcomes(OTHER, theirs.id, failing(theirs));
    const due = shift(
      openedMine.circuitOpenedAt ?? openedMine.postureSince,
      CIRCUIT_QUARANTINE_AFTER_SECONDS,
    );

    const swept = await service.sweepQuarantine(TENANT, due);

    expect(swept).toHaveLength(1);
    expect(swept[0]?.tenantId).toBe(TENANT);
  });
});

describe("IntegrationEndpointService — reading", () => {
  it("returns one endpoint, or 404s naming the id asked for", async () => {
    const { service } = harness();
    const endpoint = await service.register(params());

    expect(await service.get(TENANT, endpoint.id)).toEqual(endpoint);
    await expect(service.get(TENANT, MISSING)).rejects.toThrow(MISSING);
  });

  it("finds an endpoint by the key a runbook names it with", async () => {
    const { service } = harness();
    const endpoint = await service.register(params());

    expect(await service.getByKey(TENANT, "  Payments.Razorpay ")).toEqual(endpoint);
  });

  it("404s on a key nothing answers to, quoting the normalised form", async () => {
    const { service } = harness();

    await expect(service.getByKey(TENANT, "  Payments.Absent ")).rejects.toThrow("payments.absent");
  });

  it("refuses to read an endpoint across the tenant boundary", async () => {
    const { service } = harness();
    const endpoint = await service.register(params());

    await expect(service.get(OTHER, endpoint.id)).rejects.toThrow(IntegrationEndpointNotFoundError);
    await expect(service.getByKey(OTHER, KEY)).rejects.toThrow(IntegrationEndpointNotFoundError);
  });

  it("offers what one institution can currently reach", async () => {
    const { service } = harness();
    const active = await live(service);
    await service.register(params({ endpointKey: OTHER_KEY, displayName: "Stripe" }));
    await live(service, {
      endpointKey: "transport.tracker",
      displayName: "Tracker",
      organizationId: SECOND_ORG,
    });

    const callable = await service.listCallable(TENANT, ORG);

    expect(callable.map((endpoint) => endpoint.id)).toEqual([active.id]);
  });

  it("lists everything currently failing across the tenant rather than one institution", async () => {
    const { service } = harness();
    const here = await live(service);
    const there = await live(service, {
      endpointKey: OTHER_KEY,
      displayName: "Stripe",
      organizationId: SECOND_ORG,
    });
    await service.recordOutcomes(TENANT, here.id, failing(here));
    await service.recordOutcomes(TENANT, there.id, failing(there));

    const open = await service.listOpenCircuits(TENANT);

    expect(open.map((endpoint) => endpoint.organizationId).sort()).toEqual([ORG, SECOND_ORG]);
  });

  it("excludes a healthy endpoint from the failing list", async () => {
    const { service } = harness();
    const endpoint = await live(service);
    await service.recordOutcomes(TENANT, endpoint.id, window(endpoint));

    expect(await service.listOpenCircuits(TENANT)).toEqual([]);
  });

  it("lists every endpoint in the tenant, retired ones included", async () => {
    const { service } = harness();
    const endpoint = await service.register(params());
    await service.register(params({ endpointKey: OTHER_KEY, displayName: "Stripe" }));
    await service.retire(TENANT, endpoint.id);

    expect(await service.list(TENANT)).toHaveLength(2);
    expect(await service.list(OTHER)).toEqual([]);
  });
});
