import { describe, expect, it } from "vitest";
import type { ISODateString } from "@knowget/types";
import type { OfferedVersion } from "./gateway-view";
import { compareContractVersions, latestServableVersion, negotiateVersion } from "./negotiation";

const AS_OF = "2026-07-17T00:00:00.000Z" as ISODateString;

const version = (overrides: Partial<OfferedVersion> = {}): OfferedVersion => ({
  contractVersion: "v2",
  status: "published",
  deprecatedAt: null,
  sunsetAt: null,
  ...overrides,
});

const onNotice = (contractVersion: string, sunsetAt: string): OfferedVersion =>
  version({
    contractVersion,
    status: "deprecated",
    deprecatedAt: "2026-01-01T00:00:00.000Z" as ISODateString,
    sunsetAt: sunsetAt as ISODateString,
  });

describe("ordering versions", () => {
  it("reads the numbers rather than the text", () => {
    expect(compareContractVersions("v2", "v10")).toBe(-1);
    expect(compareContractVersions("v10", "v2")).toBe(1);
  });

  it("compares each numeric run in turn", () => {
    expect(compareContractVersions("2.1.0", "2.1.3")).toBe(-1);
    expect(compareContractVersions("2.10.0", "2.9.0")).toBe(1);
  });

  it("treats a run nobody wrote as zero", () => {
    expect(compareContractVersions("v2", "v2.1")).toBe(-1);
    expect(compareContractVersions("v2.1", "v2")).toBe(1);
  });

  it("sorts a version with no numbers in it below every numbered one", () => {
    expect(compareContractVersions("beta", "v1")).toBe(-1);
    expect(compareContractVersions("v1", "beta")).toBe(1);
  });

  it("falls back to the text only when the numbers tie", () => {
    expect(compareContractVersions("v2-beta", "v2-alpha")).toBe(1);
    expect(compareContractVersions("v2", "v2")).toBe(0);
  });

  it("orders a whole list the way an integrator would read it", () => {
    expect(["v10", "v1", "v2", "beta"].sort(compareContractVersions)).toEqual([
      "beta",
      "v1",
      "v2",
      "v10",
    ]);
  });
});

describe("the latest servable version", () => {
  it("picks the newest version that is not on notice", () => {
    const offered = [version({ contractVersion: "v1" }), version({ contractVersion: "v10" })];
    expect(latestServableVersion(offered, AS_OF)?.contractVersion).toBe("v10");
  });

  it("prefers a current version to a newer one that is on notice", () => {
    const offered = [
      version({ contractVersion: "v2" }),
      onNotice("v3", "2026-12-01T00:00:00.000Z"),
    ];
    expect(latestServableVersion(offered, AS_OF)?.contractVersion).toBe("v2");
  });

  it("falls back to the newest on notice when nothing else answers", () => {
    const offered = [
      onNotice("v1", "2026-12-01T00:00:00.000Z"),
      onNotice("v2", "2026-12-01T00:00:00.000Z"),
    ];
    expect(latestServableVersion(offered, AS_OF)?.contractVersion).toBe("v2");
  });

  it("does not offer a draft or a version that has stopped answering", () => {
    const offered = [
      version({ contractVersion: "v3", status: "draft" }),
      version({ contractVersion: "v1", status: "sunset" }),
      version({ contractVersion: "v2" }),
    ];
    expect(latestServableVersion(offered, AS_OF)?.contractVersion).toBe("v2");
  });

  it("has nothing to offer when every version has gone", () => {
    const offered = [version({ contractVersion: "v1", status: "sunset" })];
    expect(latestServableVersion(offered, AS_OF)).toBeNull();
  });
});

describe("negotiating without naming a version", () => {
  it("seats the caller on the newest current version with no notice attached", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered: [version({ contractVersion: "v1" }), version({ contractVersion: "v2" })],
      asOf: AS_OF,
    });

    expect(verdict.seated).toBe(true);
    expect(verdict.servedVersion).toBe("v2");
    expect(verdict.deprecated).toBe(false);
    expect(verdict.sunsetAt).toBeNull();
    expect(verdict.refusal).toBeNull();
  });

  it("does not enrol a caller in a deadline they never asked about", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered: [version({ contractVersion: "v2" }), onNotice("v3", "2026-12-01T00:00:00.000Z")],
      asOf: AS_OF,
    });

    expect(verdict.servedVersion).toBe("v2");
    expect(verdict.deprecated).toBe(false);
  });

  it("serves a version on notice rather than nothing, and carries the notice", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered: [onNotice("v2", "2026-12-01T00:00:00.000Z")],
      asOf: AS_OF,
    });

    expect(verdict.seated).toBe(true);
    expect(verdict.servedVersion).toBe("v2");
    expect(verdict.deprecated).toBe(true);
    expect(verdict.sunsetAt).toBe("2026-12-01T00:00:00.000Z");
  });

  it("tells a capability with no versions apart from one with no servable version", () => {
    const empty = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered: [],
      asOf: AS_OF,
    });
    const gone = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered: [version({ contractVersion: "v1", status: "sunset" })],
      asOf: AS_OF,
    });

    expect(empty.refusal).toBe("no_versions_offered");
    expect(gone.refusal).toBe("version_not_servable");
  });

  it("carries no version and no date on a refusal", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered: [],
      asOf: AS_OF,
    });

    expect(verdict.seated).toBe(false);
    expect(verdict.servedVersion).toBeNull();
    expect(verdict.sunsetAt).toBeNull();
    expect(verdict.deprecated).toBe(false);
  });
});

describe("negotiating a named version", () => {
  const offered = [
    version({ contractVersion: "v1", status: "sunset" }),
    onNotice("v2", "2026-12-01T00:00:00.000Z"),
    version({ contractVersion: "v3" }),
  ];

  it("keeps a caller on the version they pinned rather than moving them", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: "v3",
      offered,
      asOf: AS_OF,
    });

    expect(verdict.servedVersion).toBe("v3");
    expect(verdict.deprecated).toBe(false);
  });

  it("serves a deprecated version to whoever pinned it, with the notice on every call", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: "v2",
      offered,
      asOf: AS_OF,
    });

    expect(verdict.seated).toBe(true);
    expect(verdict.servedVersion).toBe("v2");
    expect(verdict.deprecated).toBe(true);
    expect(verdict.sunsetAt).toBe("2026-12-01T00:00:00.000Z");
  });

  it("tells a typo apart from a migration", () => {
    const unknown = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: "v9",
      offered,
      asOf: AS_OF,
    });
    const sunset = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: "v1",
      offered,
      asOf: AS_OF,
    });

    expect(unknown.refusal).toBe("unknown_version");
    expect(sunset.refusal).toBe("version_not_servable");
  });

  it("will not seat anyone on a version that has not been published", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: "v4",
      offered: [...offered, version({ contractVersion: "v4", status: "draft" })],
      asOf: AS_OF,
    });

    expect(verdict.refusal).toBe("version_not_servable");
  });

  it("refuses on the sunset date rather than on the status bookkeeping that follows it", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: "v2",
      offered: [onNotice("v2", "2026-06-01T00:00:00.000Z")],
      asOf: AS_OF,
    });

    expect(verdict.seated).toBe(false);
    expect(verdict.refusal).toBe("version_not_servable");
  });

  it("normalises what the caller named the way the platform stores it", () => {
    const verdict = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: " V3 ",
      offered,
      asOf: AS_OF,
    });

    expect(verdict.servedVersion).toBe("v3");
  });

  it("answers for the instant it is asked about rather than for today", () => {
    const pinned = [onNotice("v2", "2026-12-01T00:00:00.000Z")];
    const request = { capabilityKey: "admissions.applications", requested: "v2", offered: pinned };

    const before = negotiateVersion({
      ...request,
      asOf: "2025-06-01T00:00:00.000Z" as ISODateString,
    });
    const during = negotiateVersion({
      ...request,
      asOf: "2026-04-01T00:00:00.000Z" as ISODateString,
    });
    const after = negotiateVersion({
      ...request,
      asOf: "2027-01-01T00:00:00.000Z" as ISODateString,
    });

    expect(before.deprecated).toBe(false);
    expect(before.sunsetAt).toBeNull();
    expect(during.deprecated).toBe(true);
    expect(during.sunsetAt).toBe("2026-12-01T00:00:00.000Z");
    expect(after.seated).toBe(false);
  });

  it("seats the caller on the same version whatever order the offers arrive in", () => {
    const forwards = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered,
      asOf: AS_OF,
    });
    const backwards = negotiateVersion({
      capabilityKey: "admissions.applications",
      requested: null,
      offered: [...offered].reverse(),
      asOf: AS_OF,
    });

    expect(forwards.servedVersion).toBe(backwards.servedVersion);
    expect(forwards.servedVersion).toBe("v3");
  });
});
