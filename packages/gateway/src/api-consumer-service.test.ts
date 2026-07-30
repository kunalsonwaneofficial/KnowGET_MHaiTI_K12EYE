import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type RegisterApiConsumerParams, isApiConsumerActive } from "./api-consumer";
import { ApiConsumerService } from "./api-consumer-service";
import {
  ApiConsumerNotFoundError,
  DuplicateConsumerKeyError,
  OrganizationNotFoundForGatewayError,
  PersonNotFoundForGatewayError,
  UnknownScopeError,
} from "./errors";
import {
  CONSUMER_ACTIVATED,
  CONSUMER_CREDENTIAL_ROTATED,
  CONSUMER_REGISTERED,
  CONSUMER_RETIRED,
  CONSUMER_SCOPES_CHANGED,
  CONSUMER_SUSPENDED,
} from "./gateway-events";
import {
  InMemoryApiConsumerRepository,
  type OrganizationDirectory,
  type PersonDirectory,
  type ScopeCatalogue,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const ABSENT_ORG = "org-absent" as Uuid;
const OWNER = "person-1" as Uuid;
const SUCCESSOR = "person-2" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const MISSING = "consumer-absent" as Uuid;

const READ = "admissions.applications.read";
const WRITE = "admissions.applications.write";
const UNKNOWN = "admissions.applications.destroy";

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
  exists: async (_tenantId, organizationId) => organizationId === ORG,
};
const people: PersonDirectory = {
  exists: async (_tenantId, personId) => personId !== ABSENT_PERSON,
};
const scopes: ScopeCatalogue = {
  exists: async (_tenantId, scope) => scope !== UNKNOWN,
};

const params = (overrides: Partial<RegisterApiConsumerParams> = {}): RegisterApiConsumerParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  consumerKey: "district.reporting-bridge",
  displayName: "District Reporting Bridge",
  authScheme: "oauth2_client_credentials",
  credentialRef: "vault:gateway/consumers/reporting-bridge",
  grantedScopes: [READ],
  ownerId: OWNER,
  registeredBy: OWNER,
  ...overrides,
});

const harness = () => {
  const repository = new InMemoryApiConsumerRepository();
  const events = recorder();
  const service = new ApiConsumerService({ repository, organizations, people, scopes, events });
  return { repository, events, service };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

describe("ApiConsumerService — registration", () => {
  it("registers an integration, stores it and announces it", async () => {
    const { repository, events, service } = harness();

    const consumer = await service.register(params());

    expect(consumer.status).toBe("registered");
    expect(consumer.consumerKey).toBe("district.reporting-bridge");
    expect(await repository.findById(TENANT, consumer.id)).toEqual(consumer);
    expect(types(events)).toEqual([CONSUMER_REGISTERED]);
  });

  it("refuses an organization the directory does not know", async () => {
    const { service } = harness();

    await expect(service.register(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForGatewayError,
    );
  });

  it("refuses a consumer key already taken anywhere in the tenant", async () => {
    const { service } = harness();
    await service.register(params());

    await expect(service.register(params({ displayName: "Second Bridge" }))).rejects.toThrow(
      DuplicateConsumerKeyError,
    );
  });

  it("compares consumer keys after normalisation", async () => {
    const { service } = harness();
    await service.register(params());

    await expect(
      service.register(params({ consumerKey: "District.Reporting-Bridge" })),
    ).rejects.toThrow(DuplicateConsumerKeyError);
  });

  it("lets another tenant use the same consumer key", async () => {
    const { repository, service } = harness();
    await service.register(params());

    await service.register(params({ tenantId: OTHER }));

    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });

  it("refuses an owner who resolves to nobody", async () => {
    const { service } = harness();

    await expect(service.register(params({ ownerId: ABSENT_PERSON }))).rejects.toThrow(
      PersonNotFoundForGatewayError,
    );
  });

  it("accepts a null registering actor, because onboarding may be automated", async () => {
    const { service } = harness();

    const consumer = await service.register(params({ registeredBy: null }));

    expect(consumer.registeredBy).toBeNull();
  });

  it("refuses a registering actor who resolves to nobody", async () => {
    const { service } = harness();

    await expect(service.register(params({ registeredBy: ABSENT_PERSON }))).rejects.toThrow(
      PersonNotFoundForGatewayError,
    );
  });

  it("refuses a scope the platform does not issue", async () => {
    const { service } = harness();

    await expect(service.register(params({ grantedScopes: [READ, UNKNOWN] }))).rejects.toThrow(
      UnknownScopeError,
    );
  });

  it("writes nothing and announces nothing when a check refuses", async () => {
    const { repository, events, service } = harness();

    await expect(service.register(params({ grantedScopes: [UNKNOWN] }))).rejects.toThrow(
      UnknownScopeError,
    );

    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("ApiConsumerService — revisions", () => {
  it("renames without announcing, because a label is not news", async () => {
    const { events, service } = harness();
    const consumer = await service.register(params());

    const renamed = await service.rename(TENANT, consumer.id, "Trust Reporting Bridge");

    expect(renamed.displayName).toBe("Trust Reporting Bridge");
    expect(types(events)).toEqual([CONSUMER_REGISTERED]);
  });

  it("reassigns to a person the directory knows", async () => {
    const { service } = harness();
    const consumer = await service.register(params());

    const reassigned = await service.reassign(TENANT, consumer.id, SUCCESSOR);

    expect(reassigned.ownerId).toBe(SUCCESSOR);
  });

  it("leaves the owner alone when the successor resolves to nobody", async () => {
    const { repository, service } = harness();
    const consumer = await service.register(params());

    await expect(service.reassign(TENANT, consumer.id, ABSENT_PERSON)).rejects.toThrow(
      PersonNotFoundForGatewayError,
    );

    expect((await repository.findById(TENANT, consumer.id))?.ownerId).toBe(OWNER);
  });

  it("announces a credential rotation, because the secret belongs to somebody else", async () => {
    const { events, service } = harness();
    const consumer = await service.register(params());

    const rotated = await service.rotateCredential(
      TENANT,
      consumer.id,
      "vault:gateway/consumers/reporting-bridge-v2",
    );

    expect(rotated.credentialRef).toBe("vault:gateway/consumers/reporting-bridge-v2");
    expect(types(events)).toEqual([CONSUMER_REGISTERED, CONSUMER_CREDENTIAL_ROTATED]);
  });

  it("refuses to revise a consumer in another tenant", async () => {
    const { service } = harness();
    const consumer = await service.register(params());

    await expect(service.rename(OTHER, consumer.id, "Elsewhere")).rejects.toThrow(
      ApiConsumerNotFoundError,
    );
  });
});

describe("ApiConsumerService — scopes", () => {
  it("checks every granted scope against the catalogue", async () => {
    const { service } = harness();
    const consumer = await service.register(params());

    await expect(service.grantScopes(TENANT, consumer.id, [WRITE, UNKNOWN])).rejects.toThrow(
      UnknownScopeError,
    );
  });

  it("grants a known scope and announces the change", async () => {
    const { events, service } = harness();
    const consumer = await service.register(params());

    const widened = await service.grantScopes(TENANT, consumer.id, [WRITE]);

    expect(widened.grantedScopes).toEqual([READ, WRITE]);
    expect(types(events)).toEqual([CONSUMER_REGISTERED, CONSUMER_SCOPES_CHANGED]);
  });

  it("revokes without consulting the catalogue, so a withdrawn scope can still be taken back", async () => {
    const { repository, events, service } = harness();
    const consumer = await service.register(params());
    await repository.save({ ...consumer, grantedScopes: Object.freeze([READ, UNKNOWN]) });

    const narrowed = await service.revokeScopes(TENANT, consumer.id, [UNKNOWN]);

    expect(narrowed.grantedScopes).toEqual([READ]);
    expect(types(events)).toEqual([CONSUMER_REGISTERED, CONSUMER_SCOPES_CHANGED]);
  });

  it("narrows a grant and announces the change", async () => {
    const { events, service } = harness();
    const consumer = await service.register(params({ grantedScopes: [READ, WRITE] }));

    const narrowed = await service.revokeScopes(TENANT, consumer.id, [WRITE]);

    expect(narrowed.grantedScopes).toEqual([READ]);
    expect(types(events)).toEqual([CONSUMER_REGISTERED, CONSUMER_SCOPES_CHANGED]);
  });
});

describe("ApiConsumerService — lifecycle", () => {
  it("activates, suspends and retires, announcing each", async () => {
    const { events, service } = harness();
    const consumer = await service.register(params());

    await service.activate(TENANT, consumer.id);
    await service.suspend(TENANT, consumer.id, "Credential leaked in a public repository");
    const retired = await service.retire(TENANT, consumer.id);

    expect(retired.status).toBe("retired");
    expect(types(events)).toEqual([
      CONSUMER_REGISTERED,
      CONSUMER_ACTIVATED,
      CONSUMER_SUSPENDED,
      CONSUMER_RETIRED,
    ]);
  });

  it("carries the suspension reason onto the record", async () => {
    const { service } = harness();
    const consumer = await service.register(params());
    await service.activate(TENANT, consumer.id);

    const suspended = await service.suspend(TENANT, consumer.id, "Owner left the trust");

    expect(suspended.suspensionReason).toBe("Owner left the trust");
  });

  it("refuses a transition the aggregate does not allow, leaving the record as it was", async () => {
    const { repository, service } = harness();
    const consumer = await service.register(params());
    await service.activate(TENANT, consumer.id);
    await service.retire(TENANT, consumer.id);

    await expect(service.activate(TENANT, consumer.id)).rejects.toThrow();
    expect((await repository.findById(TENANT, consumer.id))?.status).toBe("retired");
  });

  it("404s on a consumer that does not exist", async () => {
    const { service } = harness();

    await expect(service.activate(TENANT, MISSING)).rejects.toThrow(ApiConsumerNotFoundError);
  });
});

describe("ApiConsumerService — reading", () => {
  it("finds a consumer by its key, normalising what the caller typed", async () => {
    const { service } = harness();
    const consumer = await service.register(params());

    expect((await service.getByKey(TENANT, "District.Reporting-Bridge")).id).toBe(consumer.id);
  });

  it("404s by key rather than returning a consumer from another tenant", async () => {
    const { service } = harness();
    await service.register(params());

    await expect(service.getByKey(OTHER, "district.reporting-bridge")).rejects.toThrow(
      ApiConsumerNotFoundError,
    );
  });

  it("lists only the consumers allowed to call", async () => {
    const { service } = harness();
    const calling = await service.register(params());
    await service.register(params({ consumerKey: "district.sis-sync" }));
    await service.activate(TENANT, calling.id);

    const active = await service.listActive(TENANT, ORG);

    expect(active.map((consumer) => consumer.id)).toEqual([calling.id]);
    expect(active.every(isApiConsumerActive)).toBe(true);
  });

  it("lists what one person is accountable for, which is what an offboarding turns on", async () => {
    const { service } = harness();
    await service.register(params());
    await service.register(params({ consumerKey: "district.sis-sync", ownerId: SUCCESSOR }));

    expect(await service.listByOwner(TENANT, SUCCESSOR)).toHaveLength(1);
  });

  it("lists everything in the tenant, retired consumers included", async () => {
    const { service } = harness();
    const consumer = await service.register(params());
    await service.activate(TENANT, consumer.id);
    await service.retire(TENANT, consumer.id);

    expect(await service.list(TENANT)).toHaveLength(1);
  });

  it("works without an event bus at all", async () => {
    const repository = new InMemoryApiConsumerRepository();
    const service = new ApiConsumerService({ repository, organizations, people, scopes });

    const consumer = await service.register(params());

    expect(await repository.findById(TENANT, consumer.id)).toEqual(consumer);
  });
});
