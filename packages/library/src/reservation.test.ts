import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  cancelReservation,
  expireReservation,
  fulfillReservation,
  isReservationOpen,
  markReservationReady,
  placeReservation,
} from "./reservation";

const base = {
  tenantId: "11111111-1111-1111-1111-111111111111" as TenantId,
  organizationId: "22222222-2222-2222-2222-222222222222" as Uuid,
  titleId: "44444444-4444-4444-4444-444444444444" as Uuid,
  memberId: "55555555-5555-5555-5555-555555555555" as Uuid,
  requestedOn: "2026-01-01",
  queuePosition: 1,
};

describe("reservation lifecycle", () => {
  it("runs requested → ready → fulfilled", () => {
    const requested = placeReservation(base);
    expect(requested.status).toBe("requested");
    expect(requested.queuePosition).toBe(1);
    expect(isReservationOpen(requested)).toBe(true);
    const ready = markReservationReady(requested, "2026-01-05", "2026-01-08");
    expect(ready.status).toBe("ready");
    expect(ready.readyOn).toBe("2026-01-05");
    expect(ready.expiresOn).toBe("2026-01-08");
    const fulfilled = fulfillReservation(ready);
    expect(fulfilled.status).toBe("fulfilled");
    expect(isReservationOpen(fulfilled)).toBe(false);
  });

  it("cancels from requested or ready, and expires from ready", () => {
    expect(cancelReservation(placeReservation(base)).status).toBe("cancelled");
    const ready = markReservationReady(placeReservation(base), "d", "d2");
    expect(cancelReservation(ready).status).toBe("cancelled");
    expect(expireReservation(ready).status).toBe("expired");
  });

  it("rejects illegal transitions", () => {
    expect(() => fulfillReservation(placeReservation(base))).toThrow(); // must be ready
    expect(() => expireReservation(placeReservation(base))).toThrow(); // must be ready
    const fulfilled = fulfillReservation(markReservationReady(placeReservation(base), "d", "d2"));
    expect(() => cancelReservation(fulfilled)).toThrow();
  });
});
