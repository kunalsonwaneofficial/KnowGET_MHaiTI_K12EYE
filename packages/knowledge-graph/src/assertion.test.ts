import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { createAssertion, isAssertionStanding, retractAssertion } from "./assertion";
import {
  EmptyAssertionError,
  InvalidAssertionTransitionError,
  MissingEvidenceSourceError,
  UngroundedAssertionError,
} from "./errors";

const base = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  subjectKind: "entity" as const,
  subjectId: "e1" as Uuid,
  predicate: "gpa",
  value: "3.8",
  method: "observed" as const,
  confidence: 90,
  evidenceSource: "sis:record-1",
};

describe("Assertion aggregate", () => {
  it("creates a standing, grounded assertion; confidence clamped", () => {
    const a = createAssertion({ ...base, confidence: 150 });
    expect(a.status).toBe("asserted");
    expect(a.confidence).toBe(100);
    expect(a.method).toBe("observed");
    expect(isAssertionStanding(a)).toBe(true);
  });

  it("requires predicate and value", () => {
    expect(() => createAssertion({ ...base, predicate: " " })).toThrow(EmptyAssertionError);
    expect(() => createAssertion({ ...base, value: "  " })).toThrow(EmptyAssertionError);
  });

  it("requires a grounded assertion to name its evidence source", () => {
    expect(() => createAssertion({ ...base, evidenceSource: null })).toThrow(
      MissingEvidenceSourceError,
    );
  });

  it("requires a derived assertion to cite antecedents (evidence chain)", () => {
    expect(() =>
      createAssertion({ ...base, method: "derived", evidenceSource: null, derivedFrom: [] }),
    ).toThrow(UngroundedAssertionError);
    const ok = createAssertion({
      ...base,
      method: "derived",
      evidenceSource: null,
      derivedFrom: ["a1" as Uuid, "a1" as Uuid, "a2" as Uuid],
    });
    expect(ok.derivedFrom).toEqual(["a1", "a2"]); // de-duplicated
  });

  it("retracts (terminal); content is never edited", () => {
    const a = retractAssertion(createAssertion(base));
    expect(a.status).toBe("retracted");
    expect(() => retractAssertion(a)).toThrow(InvalidAssertionTransitionError);
  });
});
