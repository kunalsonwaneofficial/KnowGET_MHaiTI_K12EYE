import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateRouteCodeError, OrganizationNotFoundForTransportError } from "./errors";
import type { OrganizationDirectory } from "./ports";
import { InMemoryRouteRepository } from "./ports";
import { RouteService } from "./route-service";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const organizations: OrganizationDirectory = { exists: async (_t, id) => id === ORG };

function harness() {
  const events: DomainEvent[] = [];
  const svc = new RouteService({
    repository: new InMemoryRouteRepository(),
    organizations,
    events: { publish: async (e: DomainEvent) => void events.push(e) },
  });
  return { svc, events };
}

const input = {
  tenantId: TENANT,
  organizationId: ORG,
  code: "R-01",
  name: "North Loop",
  direction: "both" as const,
  departureMinutes: 7 * 60,
  stops: [
    { key: "depot", name: "Depot", offsetMinutes: 0 },
    { key: "gate", name: "Main Gate", offsetMinutes: 15 },
  ],
};

describe("RouteService", () => {
  it("drafts a route, rejecting an unknown org and a duplicate code", async () => {
    const { svc } = harness();
    const r = await svc.draft(input);
    expect(r.status).toBe("draft");
    await expect(svc.draft(input)).rejects.toBeInstanceOf(DuplicateRouteCodeError);
    await expect(
      svc.draft({ ...input, code: "R-99", organizationId: "x" as Uuid }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundForTransportError);
  });

  it("drives the activate/suspend/resume/retire lifecycle with events", async () => {
    const { svc, events } = harness();
    const r = await svc.draft(input);
    await svc.activate(TENANT, r.id);
    await svc.suspend(TENANT, r.id);
    await svc.resume(TENANT, r.id);
    const retired = await svc.retire(TENANT, r.id);
    expect(retired.status).toBe("retired");
    expect(events.map((e) => e.type)).toEqual([
      "transport.route.activated",
      "transport.route.suspended",
      "transport.route.resumed",
      "transport.route.retired",
    ]);
  });
});
