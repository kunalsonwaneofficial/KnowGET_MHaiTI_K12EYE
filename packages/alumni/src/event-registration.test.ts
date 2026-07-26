import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  cancelRegistration,
  isRegistrationConfirmed,
  markAttended,
  markNoShow,
  registerForEvent,
  reinstateRegistration,
} from "./event-registration";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const eventId = "33333333-3333-3333-3333-333333333333" as Uuid;
const alumniProfileId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  registerForEvent({
    tenantId,
    organizationId,
    eventId,
    alumniProfileId,
    registeredOn: "2026-02-01",
  });

describe("EventRegistration", () => {
  it("registers, attends, and reflects seat-holding", () => {
    let r = make();
    expect(r.status).toBe("registered");
    expect(isRegistrationConfirmed(r)).toBe(true);
    r = markAttended(r, "2026-03-01");
    expect(r.status).toBe("attended");
    expect(r.respondedOn).toBe("2026-03-01");
  });

  it("cancels (frees the seat) and reinstates", () => {
    let r = cancelRegistration(make(), "2026-02-10");
    expect(r.status).toBe("cancelled");
    expect(isRegistrationConfirmed(r)).toBe(false);
    r = reinstateRegistration(r, "2026-02-20");
    expect(r.status).toBe("registered");
    expect(r.respondedOn).toBeNull();
  });

  it("guards transitions", () => {
    expect(() => markAttended(markAttended(make(), "d"), "d")).toThrow(/cannot move/);
    expect(() => markNoShow(cancelRegistration(make(), "d"), "d")).toThrow(/cannot move/);
    expect(() => reinstateRegistration(make(), "d")).toThrow(/cannot move/); // registered, not cancelled
  });
});
