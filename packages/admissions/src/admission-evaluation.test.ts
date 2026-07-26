import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { recordAdmissionEvaluation } from "./admission-evaluation";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const applicationId = "66666666-6666-6666-6666-666666666666" as Uuid;

const base = {
  tenantId,
  organizationId,
  applicationId,
  type: "entrance_test" as const,
  recommendation: "recommend" as const,
  evaluatedOn: "2026-11-15",
};

describe("AdmissionEvaluation", () => {
  it("records an immutable evaluation with a valid score", () => {
    const e = recordAdmissionEvaluation({ ...base, score: 82 });
    expect(e.score).toBe(82);
    expect(e.recommendation).toBe("recommend");
    expect(e.applicationId).toBe(applicationId);
  });

  it("rejects a score outside 0–100 or non-integer", () => {
    expect(() => recordAdmissionEvaluation({ ...base, score: 120 })).toThrow(/0–100/);
    expect(() => recordAdmissionEvaluation({ ...base, score: -1 })).toThrow(/0–100/);
    expect(() => recordAdmissionEvaluation({ ...base, score: 82.5 })).toThrow(/0–100/);
  });
});
