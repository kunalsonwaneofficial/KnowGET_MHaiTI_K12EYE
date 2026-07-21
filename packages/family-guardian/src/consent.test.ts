import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { isConsentActive, recordConsent } from "./consent";
import { InvalidConsentPeriodError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const STUDENT = "33333333-3333-3333-3333-333333333333" as Uuid;
const GUARDIAN = "44444444-4444-4444-4444-444444444444" as Uuid;

const grant = (over: Partial<Parameters<typeof recordConsent>[0]> = {}) =>
  recordConsent({
    tenantId: TENANT,
    organizationId: ORG,
    studentId: STUDENT,
    guardianId: GUARDIAN,
    consentType: "medical",
    decision: "granted",
    version: 1,
    ...over,
  });

describe("Consent aggregate", () => {
  it("records an immutable, versioned, timestamped grant", () => {
    const c = grant({ effectiveOn: "2026-01-01", note: "  ok  " });
    expect(c.decision).toBe("granted");
    expect(c.version).toBe(1);
    expect(c.effectiveOn).toBe("2026-01-01");
    expect(c.note).toBe("ok");
    expect(c.recordedAt).toBeTruthy();
  });

  it("rejects an expiry that precedes the effective date", () => {
    expect(() => grant({ effectiveOn: "2026-05-01", expiresOn: "2026-01-01" })).toThrow(
      InvalidConsentPeriodError,
    );
  });

  it("treats a grant as active only while in effect and unexpired", () => {
    const active = grant({ effectiveOn: "2026-01-01", expiresOn: "2026-12-31" });
    expect(isConsentActive(active, "2026-06-01")).toBe(true);
    expect(isConsentActive(active, "2025-12-31")).toBe(false); // not yet in effect
    expect(isConsentActive(active, "2027-01-01")).toBe(false); // expired
  });

  it("never treats a withdrawal as active consent", () => {
    const withdrawn = grant({ decision: "withdrawn", version: 2 });
    expect(isConsentActive(withdrawn, "2026-06-01")).toBe(false);
  });
});
