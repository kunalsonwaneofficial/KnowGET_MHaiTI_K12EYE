import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  grantCredentialZone,
  isCredentialActive,
  issueCredential,
  reinstateCredential,
  revokeCredential,
  revokeCredentialZone,
  setCredentialExpiry,
  suspendCredential,
} from "./access-credential";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const holderId = "33333333-3333-3333-3333-333333333333" as Uuid;
const zoneA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid;
const zoneB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid;

const make = (zones: Uuid[] = [zoneA]) =>
  issueCredential({
    tenantId,
    organizationId,
    credentialNumber: "C-1",
    holderType: "employee",
    holderId,
    grantedZoneIds: zones,
    issuedOn: "2026-07-01",
  });

describe("AccessCredential aggregate", () => {
  it("issues active with a trimmed number and de-duplicated granted zones", () => {
    const c = issueCredential({
      tenantId,
      organizationId,
      credentialNumber: "  C-1 ",
      holderType: "employee",
      holderId,
      grantedZoneIds: [zoneA, zoneA, zoneB],
      issuedOn: "2026-07-01",
    });
    expect(c.credentialNumber).toBe("C-1");
    expect(c.grantedZoneIds).toEqual([zoneA, zoneB]);
    expect(c.expiresOn).toBeNull();
    expect(isCredentialActive(c)).toBe(true);
    expect(() =>
      issueCredential({
        tenantId,
        organizationId,
        credentialNumber: " ",
        holderType: "person",
        holderId,
        issuedOn: "2026-07-01",
      }),
    ).toThrow(/credential number/);
  });

  it("grants and revokes zones idempotently while not revoked", () => {
    const c = make([zoneA]);
    expect(grantCredentialZone(c, zoneB).grantedZoneIds).toEqual([zoneA, zoneB]);
    expect(grantCredentialZone(c, zoneA)).toBe(c); // already granted → unchanged
    expect(revokeCredentialZone(c, zoneA).grantedZoneIds).toEqual([]);
    expect(revokeCredentialZone(c, zoneB)).toBe(c); // not granted → unchanged
    expect(setCredentialExpiry(c, "2027-01-01").expiresOn).toBe("2027-01-01");
  });

  it("runs active ↔ suspended → revoked and freezes grants once revoked", () => {
    const c = make();
    const s = suspendCredential(c);
    expect(s.status).toBe("suspended");
    expect(reinstateCredential(s).status).toBe("active");
    expect(() => reinstateCredential(c)).toThrow(/cannot move/); // active, not suspended
    expect(() => suspendCredential(s)).toThrow(/cannot move/); // already suspended
    const dead = revokeCredential(c);
    expect(dead.status).toBe("revoked");
    expect(() => revokeCredential(dead)).toThrow(/cannot move/); // terminal
    expect(() => grantCredentialZone(dead, zoneB)).toThrow(/cannot move/); // grants frozen
    expect(() => setCredentialExpiry(dead, null)).toThrow(/cannot move/);
  });
});
