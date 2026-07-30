import { describe, expect, it } from "vitest";
import type { Uuid } from "@knowget/types";
import { MAX_EXTERNAL_PATH_LENGTH } from "./gateway-value";
import type { PublicRouteView, RouteCandidate } from "./gateway-view";
import { inspectExternalPath, publishedMethods, resolveRoute } from "./routing";

const view = (overrides: Partial<PublicRouteView> = {}): PublicRouteView => ({
  capabilityKey: "admissions.applications",
  contractVersion: "v2",
  method: "GET",
  externalPath: "/v2/admissions/applications",
  status: "active",
  requiredScope: "admissions.read",
  style: "rest",
  idempotent: true,
  ...overrides,
});

const candidate = (id: string, overrides: Partial<PublicRouteView> = {}): RouteCandidate => ({
  routeId: id as Uuid,
  view: view(overrides),
});

describe("external paths", () => {
  it("accepts a literal template and binds nothing", () => {
    const verdict = inspectExternalPath("/v2/admissions/applications");
    expect(verdict.valid).toBe(true);
    expect(verdict.issue).toBeNull();
    expect(verdict.parameters).toEqual([]);
  });

  it("binds parameters in the order they appear", () => {
    const verdict = inspectExternalPath("/v2/students/{studentId}/terms/{termId}/attendance");
    expect(verdict.valid).toBe(true);
    expect(verdict.parameters).toEqual(["studentId", "termId"]);
  });

  it("requires an absolute path", () => {
    expect(inspectExternalPath("v2/admissions").issue).toBe("not_absolute");
  });

  it("refuses a trailing slash rather than trimming it", () => {
    expect(inspectExternalPath("/v2/admissions/").issue).toBe("trailing_slash");
  });

  it("refuses the root, which is nobody's capability", () => {
    expect(inspectExternalPath("/").issue).toBe("empty_segment");
  });

  it("refuses a doubled slash", () => {
    expect(inspectExternalPath("/v2//applications").issue).toBe("empty_segment");
  });

  it("refuses a path longer than the platform publishes", () => {
    const long = `/${"a".repeat(MAX_EXTERNAL_PATH_LENGTH)}`;
    expect(inspectExternalPath(long).issue).toBe("too_long");
  });

  it("refuses uppercase and spaces in a literal segment", () => {
    expect(inspectExternalPath("/v2/Admissions").issue).toBe("malformed_segment");
    expect(inspectExternalPath("/v2/admissions applications").issue).toBe("malformed_segment");
  });

  it("tells an unclosed brace apart from a bad literal", () => {
    expect(inspectExternalPath("/v2/students/{studentId").issue).toBe("malformed_parameter");
    expect(inspectExternalPath("/v2/students/studentId}").issue).toBe("malformed_parameter");
    expect(inspectExternalPath("/v2/students/{student id}").issue).toBe("malformed_parameter");
  });

  it("accepts camelCase parameter names and refuses ones starting with a capital", () => {
    expect(inspectExternalPath("/v2/students/{studentId}").valid).toBe(true);
    expect(inspectExternalPath("/v2/students/{StudentId}").issue).toBe("malformed_parameter");
  });

  it("refuses the same parameter name twice", () => {
    expect(inspectExternalPath("/v2/students/{id}/guardians/{id}").issue).toBe(
      "duplicate_parameter",
    );
  });

  it("reports the outermost problem first, so the author fixes what they can see", () => {
    expect(inspectExternalPath("v2/Admissions/").issue).toBe("not_absolute");
    expect(inspectExternalPath("/v2/Admissions/").issue).toBe("trailing_slash");
  });

  it("binds nothing when it refuses, so a rejected template cannot be half-used", () => {
    expect(inspectExternalPath("/v2/students/{studentId}/x/{studentId}").parameters).toEqual([]);
  });
});

describe("resolving a call", () => {
  const routes: readonly RouteCandidate[] = [
    candidate("route-get", { method: "GET" }),
    candidate("route-post", { method: "POST", idempotent: false }),
    candidate("route-v1", { contractVersion: "v1", method: "GET" }),
    candidate("route-other", { capabilityKey: "finance.invoices", method: "GET" }),
  ];

  it("matches on capability, version and method together", () => {
    const resolution = resolveRoute(
      { capabilityKey: "admissions.applications", contractVersion: "v2", method: "POST" },
      routes,
    );
    expect(resolution.resolved).toBe(true);
    expect(resolution.routeId).toBe("route-post");
    expect(resolution.refusal).toBeNull();
  });

  it("returns a public view and no way to reach anything internal", () => {
    const resolution = resolveRoute(
      { capabilityKey: "admissions.applications", contractVersion: "v2", method: "GET" },
      routes,
    );
    const keys = Object.keys(resolution.view ?? {});
    for (const forbidden of ["target", "handler", "module", "upstream", "internal"]) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  it("distinguishes an unknown capability from an unknown version", () => {
    expect(
      resolveRoute({ capabilityKey: "library.loans", contractVersion: "v2", method: "GET" }, routes)
        .refusal,
    ).toBe("unknown_capability");
    expect(
      resolveRoute(
        { capabilityKey: "admissions.applications", contractVersion: "v9", method: "GET" },
        routes,
      ).refusal,
    ).toBe("unknown_version");
  });

  it("distinguishes a wrong verb from a wrong resource", () => {
    expect(
      resolveRoute(
        { capabilityKey: "admissions.applications", contractVersion: "v2", method: "DELETE" },
        routes,
      ).refusal,
    ).toBe("method_not_published");
  });

  it("carries neither a route nor a view on a refusal", () => {
    const resolution = resolveRoute(
      { capabilityKey: "library.loans", contractVersion: "v2", method: "GET" },
      routes,
    );
    expect(resolution.routeId).toBeNull();
    expect(resolution.view).toBeNull();
  });

  it("normalises the capability and the version as the platform stores them", () => {
    const resolution = resolveRoute(
      { capabilityKey: " Admissions.Applications ", contractVersion: " V2 ", method: "GET" },
      routes,
    );
    expect(resolution.resolved).toBe(true);
  });

  it("does not resolve to a draft or a retired route", () => {
    const unpublished: readonly RouteCandidate[] = [
      candidate("draft", { status: "draft" }),
      candidate("retired", { status: "retired", method: "POST" }),
    ];
    expect(
      resolveRoute(
        { capabilityKey: "admissions.applications", contractVersion: "v2", method: "GET" },
        unpublished,
      ).refusal,
    ).toBe("unknown_capability");
  });

  it("keeps a draft version from hinting at itself through the refusal", () => {
    const mixed: readonly RouteCandidate[] = [
      candidate("live", { contractVersion: "v2" }),
      candidate("next", { contractVersion: "v3", status: "draft" }),
    ];
    expect(
      resolveRoute(
        { capabilityKey: "admissions.applications", contractVersion: "v3", method: "GET" },
        mixed,
      ).refusal,
    ).toBe("unknown_version");
  });

  it("refuses everything when there is nothing published at all", () => {
    expect(
      resolveRoute(
        { capabilityKey: "admissions.applications", contractVersion: "v2", method: "GET" },
        [],
      ).refusal,
    ).toBe("unknown_capability");
  });
});

describe("published methods", () => {
  const routes: readonly RouteCandidate[] = [
    candidate("a", { method: "GET" }),
    candidate("b", { method: "POST" }),
    candidate("c", { method: "DELETE", status: "draft" }),
    candidate("d", { method: "GET", contractVersion: "v1" }),
  ];

  it("lists the verbs that would have worked", () => {
    expect(publishedMethods("admissions.applications", "v2", routes)).toEqual(["GET", "POST"]);
  });

  it("leaves out anything not yet published", () => {
    expect(publishedMethods("admissions.applications", "v2", routes)).not.toContain("DELETE");
  });

  it("answers nothing for a capability it does not serve", () => {
    expect(publishedMethods("library.loans", "v2", routes)).toEqual([]);
  });
});
