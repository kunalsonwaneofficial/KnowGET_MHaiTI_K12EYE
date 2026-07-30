import { describe, expect, it } from "vitest";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type ApiContract,
  type DefineApiContractParams,
  isApiContractServable,
} from "./api-contract";
import { ApiContractService } from "./api-contract-service";
import {
  ApiContractNotFoundError,
  ContractFrozenError,
  DeprecationNoticeTooShortError,
  DuplicateContractVersionError,
  InvalidContractProgressionError,
  OrganizationNotFoundForGatewayError,
  PersonNotFoundForGatewayError,
  SunsetBeforeAnnouncementError,
  UnusableSuccessorVersionError,
} from "./errors";
import {
  CONTRACT_DEFINED,
  CONTRACT_DEPRECATED,
  CONTRACT_PUBLISHED,
  CONTRACT_SUNSET,
} from "./gateway-events";
import {
  InMemoryApiContractRepository,
  type OrganizationDirectory,
  type PersonDirectory,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org-1" as Uuid;
const SECOND_ORG = "org-2" as Uuid;
const ABSENT_ORG = "org-absent" as Uuid;
const PUBLISHER = "person-1" as Uuid;
const ABSENT_PERSON = "person-absent" as Uuid;
const MISSING = "contract-absent" as Uuid;

const CAPABILITY = "admissions.applications";

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

const organizations: OrganizationDirectory = {
  exists: async (_tenantId, organizationId) => organizationId !== ABSENT_ORG,
};
const people: PersonDirectory = {
  exists: async (_tenantId, personId) => personId !== ABSENT_PERSON,
};

const params = (overrides: Partial<DefineApiContractParams> = {}): DefineApiContractParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  capabilityKey: CAPABILITY,
  contractVersion: "v1",
  title: "Admissions Applications",
  summary: "Read and create admission applications for one school.",
  specificationRef: "specs/admissions/applications-v1.yaml",
  ...overrides,
});

const harness = () => {
  const repository = new InMemoryApiContractRepository();
  const events = recorder();
  const service = new ApiContractService({ repository, organizations, people, events });
  return { repository, events, service };
};

const types = (events: ReturnType<typeof recorder>): string[] =>
  events.published.map((event) => event.type);

/** Draft a version and put it into service, which is the precondition of every notice test below. */
const live = async (
  service: ApiContractService,
  version: string,
  overrides: Partial<DefineApiContractParams> = {},
): Promise<ApiContract> => {
  const draft = await service.define(params({ contractVersion: version, ...overrides }));
  return service.publish(TENANT, draft.id, PUBLISHER);
};

describe("ApiContractService — definition", () => {
  it("drafts a version, stores it and announces it", async () => {
    const { repository, events, service } = harness();

    const contract = await service.define(params());

    expect(contract.status).toBe("draft");
    expect(contract.publishedAt).toBeNull();
    expect(await repository.findById(TENANT, contract.id)).toEqual(contract);
    expect(types(events)).toEqual([CONTRACT_DEFINED]);
  });

  it("takes REST to be what an unqualified API means, and honours a style that is stated", async () => {
    const { service } = harness();

    const unstated = await service.define(params());
    const stated = await service.define(params({ contractVersion: "v2", style: "graphql" }));

    expect(unstated.style).toBe("rest");
    expect(stated.style).toBe("graphql");
  });

  it("refuses an organization the directory does not know", async () => {
    const { service } = harness();

    await expect(service.define(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForGatewayError,
    );
  });

  it("refuses a capability and version pair already taken", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.define(params({ title: "Applications, again" }))).rejects.toThrow(
      DuplicateContractVersionError,
    );
  });

  it("holds the pair tenant-wide, so a second school cannot publish its own v1", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.define(params({ organizationId: SECOND_ORG }))).rejects.toThrow(
      DuplicateContractVersionError,
    );
  });

  it("compares the pair after normalisation", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(
      service.define(params({ capabilityKey: "Admissions.Applications", contractVersion: "V1" })),
    ).rejects.toThrow(DuplicateContractVersionError);
  });

  it("lets another tenant hold the same pair", async () => {
    const { repository, service } = harness();
    await service.define(params());

    await service.define(params({ tenantId: OTHER }));

    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });

  it("writes nothing and announces nothing when a check refuses", async () => {
    const { repository, events, service } = harness();

    await expect(service.define(params({ organizationId: ABSENT_ORG }))).rejects.toThrow(
      OrganizationNotFoundForGatewayError,
    );

    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("ApiContractService — revisions", () => {
  it("changes a draft's text and specification without announcing anything", async () => {
    const { repository, events, service } = harness();
    const contract = await service.define(params());

    const revised = await service.revise(TENANT, contract.id, {
      title: "Admission Applications",
      summary: "Read, create and withdraw admission applications for one school.",
      specificationRef: "specs/admissions/applications-v1.1.yaml",
    });

    expect(revised.title).toBe("Admission Applications");
    expect(revised.specificationRef).toBe("specs/admissions/applications-v1.1.yaml");
    expect(await repository.findById(TENANT, contract.id)).toEqual(revised);
    expect(types(events)).toEqual([CONTRACT_DEFINED]);
  });

  it("refuses to touch a version that has been published", async () => {
    const { service } = harness();
    const contract = await live(service, "v1");

    await expect(
      service.revise(TENANT, contract.id, {
        title: "Quietly different",
        summary: contract.summary,
        specificationRef: contract.specificationRef,
      }),
    ).rejects.toThrow(ContractFrozenError);
  });

  it("404s rather than reaching a contract in another tenant", async () => {
    const { service } = harness();
    const contract = await service.define(params());

    await expect(
      service.revise(OTHER, contract.id, {
        title: "Elsewhere",
        summary: contract.summary,
        specificationRef: contract.specificationRef,
      }),
    ).rejects.toThrow(ApiContractNotFoundError);
  });
});

describe("ApiContractService — lifecycle", () => {
  it("publishes in the name of the person answerable for the promise", async () => {
    const { events, service } = harness();

    const contract = await live(service, "v1");

    expect(contract.status).toBe("published");
    expect(contract.publishedBy).toBe(PUBLISHER);
    expect(contract.publishedAt).not.toBeNull();
    expect(types(events)).toEqual([CONTRACT_DEFINED, CONTRACT_PUBLISHED]);
  });

  it("refuses a publisher who resolves to nobody, before the record is touched", async () => {
    const { repository, events, service } = harness();
    const draft = await service.define(params());

    await expect(service.publish(TENANT, draft.id, ABSENT_PERSON)).rejects.toThrow(
      PersonNotFoundForGatewayError,
    );

    expect((await repository.findById(TENANT, draft.id))?.status).toBe("draft");
    expect(types(events)).toEqual([CONTRACT_DEFINED]);
  });

  it("gives notice, records the date and names a successor that is answering", async () => {
    const { events, service } = harness();
    const v1 = await live(service, "v1");
    await live(service, "v2");
    const announcedAt = v1.createdAt;

    const deprecated = await service.deprecate(
      TENANT,
      v1.id,
      announcedAt,
      plusDays(announcedAt, 120),
      "v2",
    );

    expect(deprecated.status).toBe("deprecated");
    expect(deprecated.deprecatedAt).toBe(announcedAt);
    expect(deprecated.sunsetAt).toBe(plusDays(announcedAt, 120));
    expect(deprecated.supersededByVersion).toBe("v2");
    expect(types(events)).toEqual([
      CONTRACT_DEFINED,
      CONTRACT_PUBLISHED,
      CONTRACT_DEFINED,
      CONTRACT_PUBLISHED,
      CONTRACT_DEPRECATED,
    ]);
  });

  it("normalises the successor before recording it", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");
    await live(service, "v2");

    const deprecated = await service.deprecate(
      TENANT,
      v1.id,
      v1.createdAt,
      plusDays(v1.createdAt, 120),
      "V2",
    );

    expect(deprecated.supersededByVersion).toBe("v2");
  });

  it("refuses a notice that points at the version being retired", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");

    await expect(
      service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, 120), "v1"),
    ).rejects.toThrow(UnusableSuccessorVersionError);
  });

  it("refuses a successor that does not exist", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");

    await expect(
      service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, 120), "v2"),
    ).rejects.toThrow(UnusableSuccessorVersionError);
  });

  it("refuses a successor that is still a draft, because nobody can move onto it yet", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");
    await service.define(params({ contractVersion: "v2" }));

    await expect(
      service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, 120), "v2"),
    ).rejects.toThrow(UnusableSuccessorVersionError);
  });

  it("refuses a successor that has itself stopped answering", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");
    const v0 = await service.define(params({ contractVersion: "v0" }));
    await service.sunset(TENANT, v0.id);

    await expect(
      service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, 120), "v0"),
    ).rejects.toThrow(UnusableSuccessorVersionError);
  });

  it("refuses notice below the floor, leaving the version published and unannounced", async () => {
    const { repository, events, service } = harness();
    const v1 = await live(service, "v1");
    await live(service, "v2");

    await expect(
      service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, 30), "v2"),
    ).rejects.toThrow(DeprecationNoticeTooShortError);

    expect((await repository.findById(TENANT, v1.id))?.status).toBe("published");
    expect(types(events)).not.toContain(CONTRACT_DEPRECATED);
  });

  it("refuses a sunset date that falls before its own announcement", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");
    await live(service, "v2");

    await expect(
      service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, -10), "v2"),
    ).rejects.toThrow(SunsetBeforeAnnouncementError);
  });

  it("sunsets a version whose notice has run, keeping the date that was announced", async () => {
    const { events, service } = harness();
    const v1 = await live(service, "v1");
    await live(service, "v2");
    const announced = plusDays(v1.createdAt, 120);
    await service.deprecate(TENANT, v1.id, v1.createdAt, announced, "v2");

    const gone = await service.sunset(TENANT, v1.id);

    expect(gone.status).toBe("sunset");
    expect(gone.sunsetAt).toBe(announced);
    expect(types(events)).toContain(CONTRACT_SUNSET);
  });

  it("withdraws a draft that will never ship", async () => {
    const { service } = harness();
    const draft = await service.define(params());

    const withdrawn = await service.sunset(TENANT, draft.id);

    expect(withdrawn.status).toBe("sunset");
    expect(withdrawn.sunsetAt).not.toBeNull();
  });

  it("refuses to sunset a published version without the notice period in between", async () => {
    const { repository, service } = harness();
    const v1 = await live(service, "v1");

    await expect(service.sunset(TENANT, v1.id)).rejects.toThrow(InvalidContractProgressionError);
    expect((await repository.findById(TENANT, v1.id))?.status).toBe("published");
  });

  it("404s on a contract that does not exist", async () => {
    const { service } = harness();

    await expect(service.sunset(TENANT, MISSING)).rejects.toThrow(ApiContractNotFoundError);
  });
});

describe("ApiContractService — reading", () => {
  it("finds a contract by the pair an integrator addresses it with", async () => {
    const { service } = harness();
    const contract = await service.define(params());

    const found = await service.getByCapabilityAndVersion(TENANT, "Admissions.Applications", "V1");

    expect(found.id).toBe(contract.id);
  });

  it("404s naming the normalised pair rather than what the caller typed", async () => {
    const { service } = harness();

    await expect(
      service.getByCapabilityAndVersion(TENANT, "Admissions.Applications", "V9"),
    ).rejects.toThrow(`${CAPABILITY}@v9`);
  });

  it("404s rather than returning a contract from another tenant", async () => {
    const { service } = harness();
    await service.define(params());

    await expect(service.getByCapabilityAndVersion(OTHER, CAPABILITY, "v1")).rejects.toThrow(
      ApiContractNotFoundError,
    );
  });

  it("returns one contract by id", async () => {
    const { service } = harness();
    const contract = await service.define(params());

    expect((await service.get(TENANT, contract.id)).id).toBe(contract.id);
  });

  it("lists every version of a capability, oldest version string first", async () => {
    const { service } = harness();
    await service.define(params({ contractVersion: "v3" }));
    await service.define(params({ contractVersion: "v1" }));
    await service.define(params({ contractVersion: "v2" }));

    const versions = await service.listByCapability(TENANT, "Admissions.Applications");

    expect(versions.map((contract) => contract.contractVersion)).toEqual(["v1", "v2", "v3"]);
  });

  it("lists what the institution is answering right now", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");
    await service.define(params({ contractVersion: "v2" }));

    const servable = await service.listServable(TENANT, ORG);

    expect(servable.map((contract) => contract.id)).toEqual([v1.id]);
    expect(servable.every(isApiContractServable)).toBe(true);
  });

  it("keeps a deprecated version in the servable list, because it is still answering", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");
    await live(service, "v2");
    await service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, 120), "v2");

    expect(await service.listServable(TENANT, ORG)).toHaveLength(2);
  });

  it("lists what is on notice, each entry carrying a date and a successor", async () => {
    const { service } = harness();
    const v1 = await live(service, "v1");
    await live(service, "v2");
    await service.deprecate(TENANT, v1.id, v1.createdAt, plusDays(v1.createdAt, 120), "v2");

    const onNotice = await service.listDeprecated(TENANT, ORG);

    expect(onNotice.map((contract) => contract.id)).toEqual([v1.id]);
    expect(onNotice.every((contract) => contract.sunsetAt !== null)).toBe(true);
    expect(onNotice.every((contract) => contract.supersededByVersion !== null)).toBe(true);
  });

  it("scopes the servable read to one organization", async () => {
    const { service } = harness();
    await live(service, "v1");
    await live(service, "v2", { organizationId: SECOND_ORG });

    expect(await service.listServable(TENANT, SECOND_ORG)).toHaveLength(1);
  });

  it("lists everything in the tenant, in every status", async () => {
    const { service } = harness();
    const draft = await service.define(params({ contractVersion: "v2" }));
    await service.sunset(TENANT, draft.id);
    await live(service, "v1");

    expect(await service.list(TENANT)).toHaveLength(2);
  });

  it("works without an event bus at all", async () => {
    const repository = new InMemoryApiContractRepository();
    const service = new ApiContractService({ repository, organizations, people });

    const contract = await service.define(params());
    const published = await service.publish(TENANT, contract.id, PUBLISHER);

    expect(published.status).toBe("published");
  });
});
