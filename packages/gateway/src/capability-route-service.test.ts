import { describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type ApiContract,
  type DefineApiContractParams,
  defineApiContract,
  deprecateApiContract,
  publishApiContract,
  sunsetApiContract,
} from "./api-contract";
import { isCapabilityRouteActive } from "./capability-route";
import { CapabilityRouteService, type RegisterRouteRequest } from "./capability-route-service";
import {
  ApiContractNotFoundError,
  CapabilityRouteNotFoundError,
  ContractSunsetError,
  DuplicateRouteError,
  InvalidExternalPathError,
  InvalidRouteProgressionError,
  RouteAddressTakenError,
  RouteContractNotPublishedError,
  RouteRetiredError,
  UnknownScopeError,
  UnresolvableInternalTargetError,
} from "./errors";
import { ROUTE_ACTIVATED, ROUTE_REGISTERED, ROUTE_RETIRED } from "./gateway-events";
import {
  type CapabilityTargetDirectory,
  InMemoryApiContractRepository,
  InMemoryCapabilityRouteRepository,
  type ScopeCatalogue,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const PUBLISHER = "person-1" as Uuid;
const MISSING = "route-absent" as Uuid;
const ABSENT_CONTRACT = "contract-absent" as Uuid;

const CAPABILITY = "admissions.applications";
const READ = "admissions.applications.read";
const WRITE = "admissions.applications.write";
const UNKNOWN_SCOPE = "admissions.applications.destroy";
const TARGET = "admissions.application-query";
const OTHER_TARGET = "admissions.application-projection";
const UNRESOLVABLE = "admissions.nowhere";

const PATH = "/admissions/applications";
const OTHER_PATH = "/admissions/applications/{applicationId}";

/** Days from an instant the record itself carries, so no assertion here depends on the wall clock. */
const plusDays = (from: ISODateString, days: number): ISODateString =>
  new Date(Date.parse(from) + days * 86_400_000).toISOString() as ISODateString;

const recorder = () => {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: async (event: DomainEvent): Promise<void> => {
      published.push(event);
    },
  };
};

const scopes: ScopeCatalogue = {
  exists: async (_tenantId, scope) => scope !== UNKNOWN_SCOPE,
};
const targets: CapabilityTargetDirectory = {
  resolves: async (_tenantId, internalTarget) => internalTarget !== UNRESOLVABLE,
};

const contractParams = (
  overrides: Partial<DefineApiContractParams> = {},
): DefineApiContractParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  capabilityKey: CAPABILITY,
  contractVersion: "v1",
  title: "Admissions Applications",
  summary: "Read and create admission applications for one school.",
  specificationRef: "specs/admissions/applications-v1.yaml",
  ...overrides,
});

const harness = async () => {
  const repository = new InMemoryCapabilityRouteRepository();
  const contracts = new InMemoryApiContractRepository();
  const events = recorder();
  const service = new CapabilityRouteService({ repository, contracts, scopes, targets, events });
  const contract = publishApiContract(defineApiContract(contractParams()), PUBLISHER);
  await contracts.save(contract);
  return { repository, contracts, events, service, contract };
};

const request = (
  contract: ApiContract,
  overrides: Partial<RegisterRouteRequest> = {},
): RegisterRouteRequest => ({
  tenantId: TENANT,
  contractId: contract.id,
  method: "GET",
  externalPath: PATH,
  requiredScope: READ,
  internalTarget: TARGET,
  idempotencyGuarded: false,
  ...overrides,
});

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("CapabilityRouteService — registration", () => {
  it("registers an address as a draft, storing it and announcing it", async () => {
    const { repository, events, service, contract } = await harness();

    const route = await service.register(request(contract));

    expect(route.status).toBe("draft");
    expect(route.activatedAt).toBeNull();
    expect(await repository.findById(TENANT, route.id)).toEqual(route);
    expect(types(events)).toEqual([ROUTE_REGISTERED]);
  });

  it("reads the capability, version, style and school off the contract", async () => {
    const { service, contract } = await harness();

    const route = await service.register(request(contract));

    expect(route.capabilityKey).toBe(contract.capabilityKey);
    expect(route.contractVersion).toBe(contract.contractVersion);
    expect(route.style).toBe(contract.style);
    expect(route.organizationId).toBe(contract.organizationId);
    expect(route.contractId).toBe(contract.id);
  });

  it("binds the parameters named in the path", async () => {
    const { service, contract } = await harness();

    const route = await service.register(request(contract, { externalPath: OTHER_PATH }));

    expect(route.pathParameters).toEqual(["applicationId"]);
  });

  it("404s on a contract that does not exist", async () => {
    const { service, contract } = await harness();

    await expect(
      service.register(request(contract, { contractId: ABSENT_CONTRACT })),
    ).rejects.toThrow(ApiContractNotFoundError);
  });

  it("registers against a draft contract, because the route is a draft too", async () => {
    const { contracts, service } = await harness();
    const draft = defineApiContract(contractParams({ contractVersion: "v2" }));
    await contracts.save(draft);

    const route = await service.register(request(draft));

    expect(route.status).toBe("draft");
  });

  it("refuses a version that has stopped answering", async () => {
    const { contracts, service } = await harness();
    const gone = sunsetApiContract(defineApiContract(contractParams({ contractVersion: "v0" })));
    await contracts.save(gone);

    await expect(service.register(request(gone))).rejects.toThrow(ContractSunsetError);
  });

  it("refuses a second route for the same contract under the same method", async () => {
    const { service, contract } = await harness();
    await service.register(request(contract));

    await expect(service.register(request(contract, { externalPath: OTHER_PATH }))).rejects.toThrow(
      DuplicateRouteError,
    );
  });

  it("allows a second method on the same contract", async () => {
    const { service, contract } = await harness();
    await service.register(request(contract));

    const created = await service.register(
      request(contract, { method: "POST", requiredScope: WRITE, idempotencyGuarded: true }),
    );

    expect(created.method).toBe("POST");
  });

  it("frees the method once the earlier route is retired", async () => {
    const { service, contract } = await harness();
    const first = await service.register(request(contract));
    await service.retire(TENANT, first.id);

    const replacement = await service.register(request(contract));

    expect(replacement.externalPath).toBe(PATH);
  });

  it("refuses an address another route already claims", async () => {
    const { contracts, service, contract } = await harness();
    const second = publishApiContract(
      defineApiContract(contractParams({ contractVersion: "v2" })),
      PUBLISHER,
    );
    await contracts.save(second);
    await service.register(request(contract));

    await expect(service.register(request(second))).rejects.toThrow(RouteAddressTakenError);
  });

  it("frees the address once the route holding it is retired", async () => {
    const { contracts, service, contract } = await harness();
    const second = publishApiContract(
      defineApiContract(contractParams({ contractVersion: "v2" })),
      PUBLISHER,
    );
    await contracts.save(second);
    const holder = await service.register(request(contract));
    await service.retire(TENANT, holder.id);

    const migrated = await service.register(request(second));

    expect(migrated.externalPath).toBe(PATH);
  });

  it("refuses a scope the platform does not issue", async () => {
    const { service, contract } = await harness();

    await expect(
      service.register(request(contract, { requiredScope: UNKNOWN_SCOPE })),
    ).rejects.toThrow(UnknownScopeError);
  });

  it("refuses a target that resolves to nothing", async () => {
    const { service, contract } = await harness();

    await expect(
      service.register(request(contract, { internalTarget: UNRESOLVABLE })),
    ).rejects.toThrow(UnresolvableInternalTargetError);
  });

  it("writes nothing and announces nothing when a check refuses", async () => {
    const { repository, events, service, contract } = await harness();

    await expect(
      service.register(request(contract, { externalPath: "admissions/applications" })),
    ).rejects.toThrow(InvalidExternalPathError);

    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("takes a read to be idempotent whatever the caller claims", async () => {
    const { service, contract } = await harness();

    const route = await service.register(request(contract, { idempotencyGuarded: false }));

    expect(route.idempotent).toBe(true);
  });

  it("takes the caller's word on a method that changes something", async () => {
    const { service, contract } = await harness();

    const guarded = await service.register(
      request(contract, { method: "POST", requiredScope: WRITE, idempotencyGuarded: true }),
    );
    const unguarded = await service.register(
      request(contract, {
        method: "PUT",
        externalPath: OTHER_PATH,
        requiredScope: WRITE,
        idempotencyGuarded: false,
      }),
    );

    expect(guarded.idempotent).toBe(true);
    expect(unguarded.idempotent).toBe(false);
  });
});

describe("CapabilityRouteService — revisions", () => {
  it("changes the published surface of a draft without announcing anything", async () => {
    const { repository, events, service, contract } = await harness();
    const route = await service.register(request(contract));

    const revised = await service.revise(TENANT, route.id, {
      externalPath: OTHER_PATH,
      requiredScope: WRITE,
      idempotencyGuarded: true,
    });

    expect(revised.externalPath).toBe(OTHER_PATH);
    expect(revised.requiredScope).toBe(WRITE);
    expect(await repository.findById(TENANT, route.id)).toEqual(revised);
    expect(types(events)).toEqual([ROUTE_REGISTERED]);
  });

  it("lets a draft keep its own address while changing something else", async () => {
    const { service, contract } = await harness();
    const route = await service.register(request(contract));

    const revised = await service.revise(TENANT, route.id, {
      externalPath: PATH,
      requiredScope: WRITE,
      idempotencyGuarded: false,
    });

    expect(revised.requiredScope).toBe(WRITE);
  });

  it("refuses a revision onto an address another route holds", async () => {
    const { contracts, service, contract } = await harness();
    const second = publishApiContract(
      defineApiContract(contractParams({ contractVersion: "v2" })),
      PUBLISHER,
    );
    await contracts.save(second);
    await service.register(request(contract));
    const moving = await service.register(request(second, { externalPath: OTHER_PATH }));

    await expect(
      service.revise(TENANT, moving.id, {
        externalPath: PATH,
        requiredScope: READ,
        idempotencyGuarded: false,
      }),
    ).rejects.toThrow(RouteAddressTakenError);
  });

  it("refuses a revision naming a scope the platform does not issue", async () => {
    const { service, contract } = await harness();
    const route = await service.register(request(contract));

    await expect(
      service.revise(TENANT, route.id, {
        externalPath: PATH,
        requiredScope: UNKNOWN_SCOPE,
        idempotencyGuarded: false,
      }),
    ).rejects.toThrow(UnknownScopeError);
  });

  it("refuses to change the published surface of a route that is serving calls", async () => {
    const { service, contract } = await harness();
    const route = await service.register(request(contract));
    await service.activate(TENANT, route.id);

    await expect(
      service.revise(TENANT, route.id, {
        externalPath: OTHER_PATH,
        requiredScope: READ,
        idempotencyGuarded: false,
      }),
    ).rejects.toThrow(InvalidRouteProgressionError);
  });

  it("retargets a live route without changing anything the outside world sees", async () => {
    const { events, service, contract } = await harness();
    const route = await service.register(request(contract));
    await service.activate(TENANT, route.id);

    const moved = await service.retarget(TENANT, route.id, OTHER_TARGET);

    expect(moved.internalTarget).toBe(OTHER_TARGET);
    expect(moved.externalPath).toBe(PATH);
    expect(moved.status).toBe("active");
    expect(types(events)).toEqual([ROUTE_REGISTERED, ROUTE_ACTIVATED]);
  });

  it("leaves the old target in place when the new one resolves to nothing", async () => {
    const { repository, service, contract } = await harness();
    const route = await service.register(request(contract));

    await expect(service.retarget(TENANT, route.id, UNRESOLVABLE)).rejects.toThrow(
      UnresolvableInternalTargetError,
    );

    expect((await repository.findById(TENANT, route.id))?.internalTarget).toBe(TARGET);
  });

  it("404s rather than reaching a route in another tenant", async () => {
    const { service, contract } = await harness();
    const route = await service.register(request(contract));

    await expect(service.retarget(OTHER, route.id, OTHER_TARGET)).rejects.toThrow(
      CapabilityRouteNotFoundError,
    );
  });
});

describe("CapabilityRouteService — lifecycle", () => {
  it("makes the address resolve once the contract behind it is published", async () => {
    const { events, service, contract } = await harness();
    const route = await service.register(request(contract));

    const active = await service.activate(TENANT, route.id);

    expect(active.status).toBe("active");
    expect(active.activatedAt).not.toBeNull();
    expect(types(events)).toEqual([ROUTE_REGISTERED, ROUTE_ACTIVATED]);
  });

  it("refuses to activate under a contract whose shape is still being argued about", async () => {
    const { contracts, service } = await harness();
    const draft = defineApiContract(contractParams({ contractVersion: "v2" }));
    await contracts.save(draft);
    const route = await service.register(request(draft));

    await expect(service.activate(TENANT, route.id)).rejects.toThrow(
      RouteContractNotPublishedError,
    );
  });

  it("refuses to activate under a version already on notice", async () => {
    const { contracts, service, contract } = await harness();
    const route = await service.register(request(contract));
    await contracts.save(
      deprecateApiContract(contract, contract.createdAt, plusDays(contract.createdAt, 120), "v2"),
    );

    await expect(service.activate(TENANT, route.id)).rejects.toThrow(
      RouteContractNotPublishedError,
    );
  });

  it("re-checks the address at activation, because a holder may have appeared since", async () => {
    const { repository, contracts, service, contract } = await harness();
    const second = publishApiContract(
      defineApiContract(contractParams({ contractVersion: "v2" })),
      PUBLISHER,
    );
    await contracts.save(second);
    const earlier = await service.register(request(second));
    await service.retire(TENANT, earlier.id);
    const route = await service.register(request(contract));
    await repository.save({ ...earlier, status: "active" });

    await expect(service.activate(TENANT, route.id)).rejects.toThrow(RouteAddressTakenError);
  });

  it("retires the route, announcing it and keeping the record", async () => {
    const { repository, events, service, contract } = await harness();
    const route = await service.register(request(contract));
    await service.activate(TENANT, route.id);

    const retired = await service.retire(TENANT, route.id);

    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();
    expect(await repository.findById(TENANT, route.id)).toEqual(retired);
    expect(types(events)).toEqual([ROUTE_REGISTERED, ROUTE_ACTIVATED, ROUTE_RETIRED]);
  });

  it("answers a second retirement with the fact that the path is gone", async () => {
    const { service, contract } = await harness();
    const route = await service.register(request(contract));
    await service.retire(TENANT, route.id);

    await expect(service.retire(TENANT, route.id)).rejects.toThrow(RouteRetiredError);
  });

  it("404s on a route that does not exist", async () => {
    const { service } = await harness();

    await expect(service.activate(TENANT, MISSING)).rejects.toThrow(CapabilityRouteNotFoundError);
  });
});

describe("CapabilityRouteService — reading", () => {
  it("returns one route by id", async () => {
    const { service, contract } = await harness();
    const route = await service.register(request(contract));

    expect((await service.get(TENANT, route.id)).id).toBe(route.id);
  });

  it("lists the routing table for one institution: what currently resolves", async () => {
    const { service, contract } = await harness();
    const resolving = await service.register(request(contract));
    await service.register(
      request(contract, { method: "POST", externalPath: OTHER_PATH, requiredScope: WRITE }),
    );
    await service.activate(TENANT, resolving.id);

    const table = await service.listActive(TENANT, ORG);

    expect(table.map((route) => route.id)).toEqual([resolving.id]);
    expect(table.every(isCapabilityRouteActive)).toBe(true);
  });

  it("lists every address one contract publishes, in every status", async () => {
    const { service, contract } = await harness();
    const retired = await service.register(request(contract));
    await service.retire(TENANT, retired.id);
    await service.register(request(contract));

    expect(await service.listByContract(TENANT, contract.id)).toHaveLength(2);
  });

  it("lists everything in the tenant, retired routes included", async () => {
    const { service, contract } = await harness();
    const route = await service.register(request(contract));
    await service.retire(TENANT, route.id);

    expect(await service.list(TENANT)).toHaveLength(1);
  });

  it("works without an event bus at all", async () => {
    const repository = new InMemoryCapabilityRouteRepository();
    const contracts = new InMemoryApiContractRepository();
    const service = new CapabilityRouteService({ repository, contracts, scopes, targets });
    const contract = publishApiContract(defineApiContract(contractParams()), PUBLISHER);
    await contracts.save(contract);

    const route = await service.register(request(contract));
    const active = await service.activate(TENANT, route.id);

    expect(active.status).toBe("active");
  });
});
