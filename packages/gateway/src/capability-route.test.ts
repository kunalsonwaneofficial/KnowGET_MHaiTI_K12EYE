import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type CapabilityRoute,
  type RegisterCapabilityRouteParams,
  activateCapabilityRoute,
  isCapabilityRouteActive,
  registerCapabilityRoute,
  retargetCapabilityRoute,
  retireCapabilityRoute,
  reviseCapabilityRoute,
  routeRequiresIdempotencyKey,
  toPublicRouteView,
} from "./capability-route";
import {
  EmptyGatewayKeyError,
  InvalidExternalPathError,
  InvalidGatewayKeyError,
  InvalidRouteProgressionError,
  MissingInternalTargetError,
  RouteContractNotPublishedError,
  RouteRetiredError,
} from "./errors";
import { resolveRoute } from "./routing";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const CONTRACT = "contract-1" as Uuid;

const params = (
  overrides: Partial<RegisterCapabilityRouteParams> = {},
): RegisterCapabilityRouteParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  contractId: CONTRACT,
  capabilityKey: "admissions.applications",
  contractVersion: "v2",
  method: "POST",
  externalPath: "/v2/admissions/applications",
  style: "rest",
  requiredScope: "admissions.write",
  internalTarget: "admissions.application.submit",
  idempotencyGuarded: true,
  ...overrides,
});

const registered = (overrides: Partial<RegisterCapabilityRouteParams> = {}): CapabilityRoute =>
  registerCapabilityRoute(params(overrides));

const active = (overrides: Partial<RegisterCapabilityRouteParams> = {}): CapabilityRoute =>
  activateCapabilityRoute(registered(overrides), "published");

describe("registering a route", () => {
  it("starts as a draft that resolves nothing", () => {
    const route = registered();
    expect(route.status).toBe("draft");
    expect(isCapabilityRouteActive(route)).toBe(false);
    expect(route.activatedAt).toBeNull();
  });

  it("derives the path parameters from the template rather than taking them on trust", () => {
    const route = registered({
      method: "GET",
      externalPath: "/v2/students/{studentId}/terms/{termId}",
    });
    expect(route.pathParameters).toEqual(["studentId", "termId"]);
  });

  it("normalises the capability, the version, the scope and the target", () => {
    const route = registered({
      capabilityKey: " Admissions.Applications ",
      contractVersion: " V2 ",
      requiredScope: " Admissions.Write ",
      internalTarget: " Admissions.Application.Submit ",
    });
    expect(route.capabilityKey).toBe("admissions.applications");
    expect(route.contractVersion).toBe("v2");
    expect(route.requiredScope).toBe("admissions.write");
    expect(route.internalTarget).toBe("admissions.application.submit");
  });

  it("refuses a route with nothing behind it", () => {
    expect(() => registered({ internalTarget: "   " })).toThrow(MissingInternalTargetError);
    expect(() => registered({ internalTarget: "the admissions module" })).toThrow(
      InvalidGatewayKeyError,
    );
  });

  it("refuses a blank or malformed scope", () => {
    expect(() => registered({ requiredScope: " " })).toThrow(EmptyGatewayKeyError);
    expect(() => registered({ requiredScope: "admissions write" })).toThrow(InvalidGatewayKeyError);
  });

  it("refuses a path that is not a usable template, and says what is wrong with it", () => {
    expect(() => registered({ externalPath: "v2/admissions" })).toThrow(InvalidExternalPathError);
    expect(() => registered({ externalPath: "/v2/students/{id}/x/{id}" })).toThrow(
      InvalidExternalPathError,
    );
  });

  it("treats a read as idempotent whatever was declared, and a write as declared", () => {
    expect(registered({ method: "GET", idempotencyGuarded: false }).idempotent).toBe(true);
    expect(registered({ method: "POST", idempotencyGuarded: false }).idempotent).toBe(false);
    expect(registered({ method: "POST", idempotencyGuarded: true }).idempotent).toBe(true);
  });

  it("asks for an idempotency key only where repeating a call would do something", () => {
    expect(routeRequiresIdempotencyKey(registered({ method: "GET" }))).toBe(false);
    expect(routeRequiresIdempotencyKey(registered({ method: "POST" }))).toBe(true);
    expect(
      routeRequiresIdempotencyKey(registered({ method: "POST", idempotencyGuarded: false })),
    ).toBe(false);
  });
});

describe("revising a draft", () => {
  it("changes the path, the scope and the guarantee together", () => {
    const revised = reviseCapabilityRoute(registered(), {
      externalPath: "/v2/admissions/applications/{applicationId}",
      requiredScope: "admissions.manage",
      idempotencyGuarded: false,
    });
    expect(revised.externalPath).toBe("/v2/admissions/applications/{applicationId}");
    expect(revised.pathParameters).toEqual(["applicationId"]);
    expect(revised.requiredScope).toBe("admissions.manage");
    expect(revised.idempotent).toBe(false);
  });

  it("leaves the method where the route is addressed by it", () => {
    const revised = reviseCapabilityRoute(registered(), {
      externalPath: "/v2/admissions/submissions",
      requiredScope: "admissions.write",
      idempotencyGuarded: true,
    });
    expect(revised.method).toBe("POST");
  });

  it("refuses to change the published surface of a live route", () => {
    expect(() =>
      reviseCapabilityRoute(active(), {
        externalPath: "/v2/somewhere/else",
        requiredScope: "admissions.write",
        idempotencyGuarded: true,
      }),
    ).toThrow(InvalidRouteProgressionError);
  });
});

describe("retargeting", () => {
  it("moves what answers without moving anything the world sees", () => {
    const before = active();
    const after = retargetCapabilityRoute(before, "enrolment.intake.accept");

    expect(after.internalTarget).toBe("enrolment.intake.accept");
    expect(toPublicRouteView(after)).toEqual(toPublicRouteView(before));
    expect(after.status).toBe("active");
  });

  it("works on a draft as well as on a live route", () => {
    expect(retargetCapabilityRoute(registered(), "enrolment.intake.accept").internalTarget).toBe(
      "enrolment.intake.accept",
    );
  });

  it("refuses a target that is blank or malformed", () => {
    expect(() => retargetCapabilityRoute(active(), "  ")).toThrow(MissingInternalTargetError);
    expect(() => retargetCapabilityRoute(active(), "the new module")).toThrow(
      InvalidGatewayKeyError,
    );
  });

  it("will not retarget a retired route", () => {
    expect(() => retargetCapabilityRoute(retireCapabilityRoute(active()), "x.y")).toThrow(
      RouteRetiredError,
    );
  });
});

describe("activation", () => {
  it("goes live against a published contract", () => {
    const route = active();
    expect(isCapabilityRouteActive(route)).toBe(true);
    expect(route.activatedAt).not.toBeNull();
  });

  it("refuses to go live against a contract nobody has agreed to yet", () => {
    expect(() => activateCapabilityRoute(registered(), "draft")).toThrow(
      RouteContractNotPublishedError,
    );
  });

  it("refuses to add a path to a version that is already on notice", () => {
    expect(() => activateCapabilityRoute(registered(), "deprecated")).toThrow(
      RouteContractNotPublishedError,
    );
    expect(() => activateCapabilityRoute(registered(), "sunset")).toThrow(
      RouteContractNotPublishedError,
    );
  });

  it("refuses to activate twice", () => {
    expect(() => activateCapabilityRoute(active(), "published")).toThrow(
      InvalidRouteProgressionError,
    );
  });
});

describe("retirement", () => {
  it("stops the path resolving and keeps the record", () => {
    const route = retireCapabilityRoute(active());
    expect(route.status).toBe("retired");
    expect(route.retiredAt).not.toBeNull();
    expect(route.externalPath).toBe("/v2/admissions/applications");
  });

  it("retires a draft that will never go live", () => {
    expect(retireCapabilityRoute(registered()).status).toBe("retired");
  });

  it("answers every later request with the same fact", () => {
    const route = retireCapabilityRoute(active());
    expect(() => retireCapabilityRoute(route)).toThrow(RouteRetiredError);
    expect(() => activateCapabilityRoute(route, "published")).toThrow(RouteRetiredError);
  });
});

describe("the public view", () => {
  it("carries what a caller needs and nothing about what answers", () => {
    const route = active();
    const view = toPublicRouteView(route);

    expect(view.capabilityKey).toBe("admissions.applications");
    expect(view.externalPath).toBe("/v2/admissions/applications");
    expect(view.requiredScope).toBe("admissions.write");

    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain(route.internalTarget);
    expect(serialised).not.toContain(route.contractId);
    expect(serialised).not.toContain(route.tenantId);
  });

  it("names no internal thing in any of its keys", () => {
    const keys = Object.keys(toPublicRouteView(active()));
    for (const forbidden of ["target", "handler", "module", "service", "upstream", "internal"]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  it("is what the resolver matches against, end to end", () => {
    const route = active();
    const resolution = resolveRoute(
      { capabilityKey: "admissions.applications", contractVersion: "v2", method: "POST" },
      [{ routeId: route.id, view: toPublicRouteView(route) }],
    );
    expect(resolution.resolved).toBe(true);
    expect(resolution.routeId).toBe(route.id);
  });

  it("keeps a draft route out of resolution even when it is offered", () => {
    const route = registered();
    const resolution = resolveRoute(
      { capabilityKey: "admissions.applications", contractVersion: "v2", method: "POST" },
      [{ routeId: route.id, view: toPublicRouteView(route) }],
    );
    expect(resolution.resolved).toBe(false);
  });
});

describe("immutability", () => {
  it("never mutates the route it was handed", () => {
    const route = registered();
    const before = { ...route };
    activateCapabilityRoute(route, "published");
    retargetCapabilityRoute(route, "somewhere.else");
    retireCapabilityRoute(route);
    expect({ ...route }).toEqual(before);
  });
});
