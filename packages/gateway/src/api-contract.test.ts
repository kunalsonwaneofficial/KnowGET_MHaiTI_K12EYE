import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type ApiContract,
  type DefineApiContractParams,
  contractServing,
  defineApiContract,
  deprecateApiContract,
  isApiContractDeprecated,
  isApiContractPublished,
  isApiContractServable,
  publishApiContract,
  reviseApiContract,
  sunsetApiContract,
} from "./api-contract";
import {
  ContractFrozenError,
  ContractSunsetError,
  DeprecationNoticeTooShortError,
  EmptyGatewayKeyError,
  InvalidContractProgressionError,
  InvalidGatewayKeyError,
  SunsetBeforeAnnouncementError,
} from "./errors";
import {
  DEFAULT_CONTRACT_STYLE,
  INITIAL_CONTRACT_STATUS,
  MIN_DEPRECATION_NOTICE_DAYS,
} from "./gateway-value";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const PUBLISHER = "person-1" as Uuid;

const iso = (value: string): ISODateString => value as ISODateString;
const JAN = iso("2026-01-01T00:00:00.000Z");
const JUN = iso("2026-06-01T00:00:00.000Z");
const DEC = iso("2026-12-01T00:00:00.000Z");

const params = (overrides: Partial<DefineApiContractParams> = {}): DefineApiContractParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  capabilityKey: "admissions.applications",
  contractVersion: "v2",
  title: "Admissions Applications",
  summary: "Submit and track applications for a published admissions cycle.",
  specificationRef: "spec://openapi/admissions.applications/v2",
  ...overrides,
});

const drafted = (overrides: Partial<DefineApiContractParams> = {}): ApiContract =>
  defineApiContract(params(overrides));

const published = (overrides: Partial<DefineApiContractParams> = {}): ApiContract =>
  publishApiContract(drafted(overrides), PUBLISHER);

const deprecated = (): ApiContract => deprecateApiContract(published(), JAN, DEC, "v3");

describe("defining a contract", () => {
  it("starts as a draft, promising nobody anything", () => {
    const contract = drafted();
    expect(contract.status).toBe(INITIAL_CONTRACT_STATUS);
    expect(contract.status).toBe("draft");
    expect(isApiContractServable(contract)).toBe(false);
    expect(contract.publishedAt).toBeNull();
    expect(contract.publishedBy).toBeNull();
  });

  it("normalises the capability and the version, and trims the prose", () => {
    const contract = drafted({
      capabilityKey: "  Admissions.Applications ",
      contractVersion: " V2 ",
      title: "  Admissions Applications  ",
    });
    expect(contract.capabilityKey).toBe("admissions.applications");
    expect(contract.contractVersion).toBe("v2");
    expect(contract.title).toBe("Admissions Applications");
  });

  it("defaults to REST, because that is what an unqualified API means to an integrator", () => {
    expect(drafted().style).toBe(DEFAULT_CONTRACT_STYLE);
    expect(drafted({ style: "graphql" }).style).toBe("graphql");
  });

  it("refuses a blank or malformed capability and version", () => {
    expect(() => drafted({ capabilityKey: "  " })).toThrow(EmptyGatewayKeyError);
    expect(() => drafted({ capabilityKey: "admissions applications" })).toThrow(
      InvalidGatewayKeyError,
    );
    expect(() => drafted({ contractVersion: "" })).toThrow(EmptyGatewayKeyError);
  });

  it("refuses a version with no specification behind it", () => {
    expect(() => drafted({ specificationRef: "   " })).toThrow(EmptyGatewayKeyError);
  });

  it("names no internal target anywhere in the record", () => {
    const keys = Object.keys(drafted());
    for (const forbidden of ["target", "handler", "module", "service", "upstream", "internal"]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});

describe("revising a draft", () => {
  it("changes the text and the specification together", () => {
    const revised = reviseApiContract(drafted(), {
      title: "Admissions Applications (v2)",
      summary: "Submit, track and withdraw applications.",
      specificationRef: "spec://openapi/admissions.applications/v2.1",
    });
    expect(revised.title).toBe("Admissions Applications (v2)");
    expect(revised.specificationRef).toBe("spec://openapi/admissions.applications/v2.1");
  });

  it("leaves the capability, the version and the style where routes address them", () => {
    const revised = reviseApiContract(drafted(), {
      title: "Renamed",
      summary: "Rewritten.",
      specificationRef: "spec://openapi/x",
    });
    expect(revised.capabilityKey).toBe("admissions.applications");
    expect(revised.contractVersion).toBe("v2");
    expect(revised.style).toBe("rest");
  });

  it("refuses to edit anything that has been published", () => {
    const edit = { title: "t", summary: "s", specificationRef: "spec://x" };
    expect(() => reviseApiContract(published(), edit)).toThrow(ContractFrozenError);
    expect(() => reviseApiContract(deprecated(), edit)).toThrow(ContractFrozenError);
  });
});

describe("publication", () => {
  it("publishes with a name attached", () => {
    const contract = published();
    expect(isApiContractPublished(contract)).toBe(true);
    expect(isApiContractServable(contract)).toBe(true);
    expect(contract.publishedBy).toBe(PUBLISHER);
    expect(contract.publishedAt).not.toBeNull();
  });

  it("refuses to publish twice", () => {
    expect(() => publishApiContract(published(), PUBLISHER)).toThrow(
      InvalidContractProgressionError,
    );
  });
});

describe("deprecation", () => {
  it("gives notice, sets the date and names the successor", () => {
    const contract = deprecated();
    expect(isApiContractDeprecated(contract)).toBe(true);
    expect(isApiContractServable(contract)).toBe(true);
    expect(contract.deprecatedAt).toBe(JAN);
    expect(contract.sunsetAt).toBe(DEC);
    expect(contract.supersededByVersion).toBe("v3");
  });

  it("refuses a notice shorter than the floor, and the floor takes no argument", () => {
    const short = iso(
      new Date(Date.parse(JAN) + (MIN_DEPRECATION_NOTICE_DAYS - 1) * 86_400_000).toISOString(),
    );
    expect(() => deprecateApiContract(published(), JAN, short, "v3")).toThrow(
      DeprecationNoticeTooShortError,
    );
  });

  it("accepts a notice exactly at the floor", () => {
    const exact = iso(
      new Date(Date.parse(JAN) + MIN_DEPRECATION_NOTICE_DAYS * 86_400_000).toISOString(),
    );
    expect(deprecateApiContract(published(), JAN, exact, "v3").sunsetAt).toBe(exact);
  });

  it("distinguishes transposed dates from a short notice period", () => {
    expect(() => deprecateApiContract(published(), DEC, JAN, "v3")).toThrow(
      SunsetBeforeAnnouncementError,
    );
  });

  it("refuses to deprecate a draft: a version nobody was served is withdrawn, not deprecated", () => {
    expect(() => deprecateApiContract(drafted(), JAN, DEC, "v3")).toThrow(
      InvalidContractProgressionError,
    );
  });

  it("refuses a successor version that is not a well-formed version", () => {
    expect(() => deprecateApiContract(published(), JAN, DEC, "the next one")).toThrow(
      InvalidGatewayKeyError,
    );
  });

  it("offers no way back to publication", () => {
    expect(() => publishApiContract(deprecated(), PUBLISHER)).toThrow(
      InvalidContractProgressionError,
    );
  });
});

describe("sunset", () => {
  it("ends a deprecated version and keeps the announced date", () => {
    const contract = sunsetApiContract(deprecated());
    expect(contract.status).toBe("sunset");
    expect(contract.sunsetAt).toBe(DEC);
    expect(isApiContractServable(contract)).toBe(false);
  });

  it("withdraws a draft that will never ship", () => {
    const contract = sunsetApiContract(drafted());
    expect(contract.status).toBe("sunset");
    expect(contract.sunsetAt).not.toBeNull();
  });

  it("refuses to move anything once it is sunset", () => {
    const contract = sunsetApiContract(deprecated());
    expect(() => sunsetApiContract(contract)).toThrow(ContractSunsetError);
    expect(() => deprecateApiContract(contract, JAN, DEC, "v3")).toThrow(ContractSunsetError);
  });
});

describe("serving", () => {
  it("reads the contract's own state through the engine", () => {
    expect(contractServing(published(), JUN).served).toBe(true);
    expect(contractServing(drafted(), JUN).reason).toBe("contract_not_servable");
  });

  it("serves a deprecated version until its date and not past it", () => {
    const contract = deprecated();
    expect(contractServing(contract, JUN).served).toBe(true);
    expect(contractServing(contract, JUN).deprecated).toBe(true);
    expect(contractServing(contract, DEC).served).toBe(false);
  });

  it("answers for an instant before the notice as it was answered then", () => {
    const contract = deprecateApiContract(published(), JUN, iso("2027-06-01T00:00:00.000Z"), "v3");
    expect(contractServing(contract, JAN).deprecated).toBe(false);
    expect(contractServing(contract, JAN).served).toBe(true);
  });
});

describe("immutability", () => {
  it("never mutates the contract it was handed", () => {
    const contract = published();
    const before = { ...contract };
    deprecateApiContract(contract, JAN, DEC, "v3");
    sunsetApiContract(contract);
    expect({ ...contract }).toEqual(before);
  });
});
