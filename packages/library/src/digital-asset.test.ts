import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  catalogDigitalAsset,
  isDigitalAccessValidAsOf,
  isDigitalAssetActive,
  reactivateDigitalAsset,
  renewDigitalLicense,
  retireDigitalAsset,
  setDigitalAccess,
} from "./digital-asset";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = (accessModel: "open" | "licensed" | "subscription" = "licensed") =>
  catalogDigitalAsset({
    tenantId,
    organizationId,
    title: "  Intro to CS  ",
    format: "ebook",
    accessModel,
    licenseExpiry: "2026-12-31",
  });

describe("catalogDigitalAsset", () => {
  it("catalogs an active asset with a trimmed title", () => {
    const a = make();
    expect(a.title).toBe("Intro to CS");
    expect(a.status).toBe("active");
    expect(isDigitalAssetActive(a)).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(() =>
      catalogDigitalAsset({
        tenantId,
        organizationId,
        title: " ",
        format: "video",
        accessModel: "open",
      }),
    ).toThrow();
  });
});

describe("digital asset lifecycle & access", () => {
  it("retires and reactivates, and edits access/licence", () => {
    const retired = retireDigitalAsset(make());
    expect(retired.status).toBe("retired");
    expect(reactivateDigitalAsset(retired).status).toBe("active");
    const access = setDigitalAccess(make(), "subscription", "https://x", "Provider");
    expect(access.accessModel).toBe("subscription");
    expect(access.accessUrl).toBe("https://x");
    expect(renewDigitalLicense(make(), "2027-12-31").licenseExpiry).toBe("2027-12-31");
  });

  it("rejects invalid transitions", () => {
    expect(() => reactivateDigitalAsset(make())).toThrow();
    expect(() => retireDigitalAsset(retireDigitalAsset(make()))).toThrow();
  });
});

describe("isDigitalAccessValidAsOf", () => {
  it("is always valid for open content, and expiry-bounded for licensed content", () => {
    expect(isDigitalAccessValidAsOf(make("open"), "2099-01-01")).toBe(true);
    expect(isDigitalAccessValidAsOf(make("licensed"), "2026-06-01")).toBe(true); // before expiry
    expect(isDigitalAccessValidAsOf(make("licensed"), "2027-01-01")).toBe(false); // after expiry
    expect(isDigitalAccessValidAsOf(renewDigitalLicense(make(), null), "2099-01-01")).toBe(true);
  });
});
