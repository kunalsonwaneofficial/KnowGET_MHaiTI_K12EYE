import { describe, expect, it } from "vitest";
import type { RelationshipView } from "./knowledge-view";
import { isValidAt, latestVersion, liveRelationships, resolveAsOf } from "./temporal";

const rel = (over: Partial<RelationshipView>): RelationshipView => ({
  id: "r1",
  relationshipTypeKey: "enrolled_in",
  sourceEntityId: "a",
  targetEntityId: "b",
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: null,
  version: 1,
  status: "asserted",
  ...over,
});

describe("temporal engine", () => {
  it("is valid at an instant inside an open window", () => {
    expect(isValidAt(rel({}), "2026-06-01T00:00:00.000Z")).toBe(true);
  });

  it("is not valid before validFrom", () => {
    expect(isValidAt(rel({}), "2025-12-31T00:00:00.000Z")).toBe(false);
  });

  it("closes at validTo (end-exclusive)", () => {
    const r = rel({ validTo: "2026-06-01T00:00:00.000Z" });
    expect(isValidAt(r, "2026-05-31T23:59:59.000Z")).toBe(true);
    expect(isValidAt(r, "2026-06-01T00:00:00.000Z")).toBe(false); // exclusive end
  });

  it("only counts asserted relationships unless status is ignored", () => {
    const superseded = rel({ status: "superseded" });
    expect(isValidAt(superseded, "2026-06-01T00:00:00.000Z")).toBe(false);
    expect(isValidAt(superseded, "2026-06-01T00:00:00.000Z", { ignoreStatus: true })).toBe(true);
  });

  it("treats an unparseable stamp as not-valid (fail-safe)", () => {
    expect(isValidAt(rel({ validFrom: "not-a-date" }), "2026-06-01T00:00:00.000Z")).toBe(false);
  });

  it("resolveAsOf returns only the edges live at the instant, order-preserving", () => {
    const rels = [
      rel({ id: "past", validFrom: "2020-01-01", validTo: "2021-01-01" }),
      rel({ id: "current", validFrom: "2026-01-01", validTo: null }),
      rel({ id: "future", validFrom: "2027-01-01", validTo: null }),
    ];
    expect(resolveAsOf(rels, "2026-06-01T00:00:00.000Z").map((r) => r.id)).toEqual(["current"]);
  });

  it("liveRelationships keeps only asserted", () => {
    const rels = [rel({ id: "a" }), rel({ id: "b", status: "retracted" })];
    expect(liveRelationships(rels).map((r) => r.id)).toEqual(["a"]);
  });

  it("latestVersion returns the max version (0 for empty)", () => {
    expect(latestVersion([])).toBe(0);
    expect(latestVersion([rel({ version: 1 }), rel({ version: 3 }), rel({ version: 2 })])).toBe(3);
  });
});
