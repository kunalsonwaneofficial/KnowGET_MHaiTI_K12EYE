import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { recordAcknowledgement } from "./acknowledgement";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const announcementId = "66666666-6666-6666-6666-666666666666" as Uuid;
const personId = "77777777-7777-7777-7777-777777777777" as Uuid;

describe("AcknowledgementReceipt", () => {
  it("records an immutable receipt carrying its identity and the moment", () => {
    const r = recordAcknowledgement({
      tenantId,
      organizationId,
      announcementId,
      personId,
      acknowledgedAt: "2026-07-01T10:00:00.000Z",
    });
    expect(r.announcementId).toBe(announcementId);
    expect(r.personId).toBe(personId);
    expect(r.acknowledgedAt).toBe("2026-07-01T10:00:00.000Z");
    expect(r.id).toBeTruthy();
  });
});
