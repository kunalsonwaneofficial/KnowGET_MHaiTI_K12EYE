import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { recordAccessEvent } from "./access-event";
import { summarizeAccessActivity } from "./access";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const credentialId = "33333333-3333-3333-3333-333333333333" as Uuid;
const zoneId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = (decision: "granted" | "denied" = "granted", pointLabel: string | null = "Door 1") =>
  recordAccessEvent({
    tenantId,
    organizationId,
    credentialId,
    zoneId,
    pointLabel,
    decision,
    reason: decision === "granted" ? "ok" : "zone_not_granted",
    occurredAt: "2026-07-01T09:00:00.000Z",
  });

describe("AccessEvent aggregate", () => {
  it("records an immutable decision, normalizing a blank point label", () => {
    const e = make("granted", "  ");
    expect(e.decision).toBe("granted");
    expect(e.reason).toBe("ok");
    expect(e.pointLabel).toBeNull();
    expect(e.occurredAt).toBe("2026-07-01T09:00:00.000Z");
  });

  it("structurally satisfies the access-activity view", () => {
    const summary = summarizeAccessActivity([make("granted"), make("denied"), make("granted")]);
    expect(summary).toEqual({ total: 3, granted: 2, denied: 1 });
  });
});
