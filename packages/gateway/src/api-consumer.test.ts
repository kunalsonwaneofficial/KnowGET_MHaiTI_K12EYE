import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  type ApiConsumer,
  type RegisterApiConsumerParams,
  activateApiConsumer,
  consumerHoldsScope,
  grantConsumerScopes,
  isApiConsumerActive,
  isApiConsumerRetired,
  isApiConsumerSuspended,
  reassignApiConsumer,
  registerApiConsumer,
  renameApiConsumer,
  retireApiConsumer,
  revokeConsumerScopes,
  rotateConsumerCredential,
  suspendApiConsumer,
  toConsumerView,
} from "./api-consumer";
import {
  ConsumerAlreadyInStatusError,
  ConsumerRetiredError,
  EmptyGatewayKeyError,
  EmptyScopeGrantError,
  InvalidConsumerProgressionError,
  InvalidGatewayKeyError,
  PlaintextCredentialError,
} from "./errors";
import { INITIAL_CONSUMER_STATUS } from "./gateway-value";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OWNER = "person-1" as Uuid;
const REGISTRAR = "person-2" as Uuid;
const SUCCESSOR_OWNER = "person-3" as Uuid;

const READ_SCOPE = "admissions.applications.read";
const WRITE_SCOPE = "admissions.applications.write";
const ATTENDANCE_SCOPE = "attendance.sessions.read";

const params = (overrides: Partial<RegisterApiConsumerParams> = {}): RegisterApiConsumerParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  consumerKey: "district.reporting-bridge",
  displayName: "District Reporting Bridge",
  authScheme: "oauth2_client_credentials",
  credentialRef: "vault:gateway/district-reporting-bridge",
  grantedScopes: [READ_SCOPE],
  ownerId: OWNER,
  registeredBy: REGISTRAR,
  ...overrides,
});

const registered = (overrides: Partial<RegisterApiConsumerParams> = {}): ApiConsumer =>
  registerApiConsumer(params(overrides));

const active = (overrides: Partial<RegisterApiConsumerParams> = {}): ApiConsumer =>
  activateApiConsumer(registered(overrides));

describe("registering an API consumer", () => {
  it("starts registered rather than active, so somebody reviews it before it can call", () => {
    const consumer = registered();
    expect(consumer.status).toBe(INITIAL_CONSUMER_STATUS);
    expect(consumer.status).toBe("registered");
    expect(isApiConsumerActive(consumer)).toBe(false);
    expect(consumer.activatedAt).toBeNull();
  });

  it("normalises the key and trims the display name", () => {
    const consumer = registered({
      consumerKey: "  District.Reporting-Bridge  ",
      displayName: "  District Reporting Bridge  ",
    });
    expect(consumer.consumerKey).toBe("district.reporting-bridge");
    expect(consumer.displayName).toBe("District Reporting Bridge");
  });

  it("stamps identity, tenancy and attribution", () => {
    const consumer = registered();
    expect(consumer.id).toMatch(/[0-9a-f-]{36}/);
    expect(consumer.tenantId).toBe(TENANT);
    expect(consumer.organizationId).toBe(ORG);
    expect(consumer.ownerId).toBe(OWNER);
    expect(consumer.registeredBy).toBe(REGISTRAR);
    expect(consumer.createdAt).toBe(consumer.updatedAt);
  });

  it("accepts an automated registration with no registrar, but never without an owner", () => {
    expect(registered({ registeredBy: null }).registeredBy).toBeNull();
  });

  it("refuses a blank key and a malformed one", () => {
    expect(() => registered({ consumerKey: "   " })).toThrow(EmptyGatewayKeyError);
    expect(() => registered({ consumerKey: "district reporting" })).toThrow(InvalidGatewayKeyError);
  });

  it("refuses a credential that is the credential rather than a handle to one", () => {
    expect(() => registered({ credentialRef: "sk-live-9f2c4a7d" })).toThrow(
      PlaintextCredentialError,
    );
  });

  it("never echoes a rejected credential back in the error", () => {
    const secret = "sk-live-9f2c4a7d";
    try {
      registered({ credentialRef: secret });
      expect.unreachable("a plaintext credential must be refused");
    } catch (error) {
      const serialised = JSON.stringify(error, Object.getOwnPropertyNames(error));
      expect(serialised).not.toContain(secret);
    }
  });

  it("accepts every provider the platform resolves", () => {
    for (const reference of ["vault:a/b", "kms:key-1", "env:GATEWAY_KEY", "secretstore:x"]) {
      expect(registered({ credentialRef: reference }).credentialRef).toBe(reference);
    }
  });

  it("refuses a grant with no scopes in it", () => {
    expect(() => registered({ grantedScopes: [] })).toThrow(EmptyScopeGrantError);
  });

  it("refuses a malformed scope", () => {
    expect(() => registered({ grantedScopes: ["admissions applications"] })).toThrow(
      InvalidGatewayKeyError,
    );
  });

  it("drops repeated scopes rather than refusing them", () => {
    const consumer = registered({ grantedScopes: [READ_SCOPE, READ_SCOPE, WRITE_SCOPE] });
    expect(consumer.grantedScopes).toEqual([READ_SCOPE, WRITE_SCOPE]);
  });
});

describe("credential rotation", () => {
  it("records that a rotation happened and when", () => {
    const rotated = rotateConsumerCredential(active(), "vault:gateway/rotated");
    expect(rotated.credentialRef).toBe("vault:gateway/rotated");
    expect(rotated.rotatedAt).not.toBeNull();
    expect(rotated.rotatedAt).toBe(rotated.updatedAt);
  });

  it("leaves rotatedAt null until something actually rotates", () => {
    expect(registered().rotatedAt).toBeNull();
  });

  it("refuses to rotate into a plaintext secret", () => {
    expect(() => rotateConsumerCredential(active(), "AKIAIOSFODNN7EXAMPLE")).toThrow(
      PlaintextCredentialError,
    );
  });

  it("refuses to rotate a retired consumer", () => {
    expect(() => rotateConsumerCredential(retireApiConsumer(active()), "vault:x/y")).toThrow(
      ConsumerRetiredError,
    );
  });
});

describe("scope grants", () => {
  it("adds without disturbing what was already held, and keeps grant order", () => {
    const widened = grantConsumerScopes(active(), [WRITE_SCOPE, ATTENDANCE_SCOPE]);
    expect(widened.grantedScopes).toEqual([READ_SCOPE, WRITE_SCOPE, ATTENDANCE_SCOPE]);
  });

  it("re-granting something already held changes nothing", () => {
    const consumer = active();
    expect(grantConsumerScopes(consumer, [READ_SCOPE]).grantedScopes).toEqual([READ_SCOPE]);
  });

  it("revokes what was named and leaves the rest", () => {
    const consumer = grantConsumerScopes(active(), [WRITE_SCOPE]);
    expect(revokeConsumerScopes(consumer, [WRITE_SCOPE]).grantedScopes).toEqual([READ_SCOPE]);
  });

  it("revoking something never held is not an error", () => {
    const consumer = active();
    expect(revokeConsumerScopes(consumer, [ATTENDANCE_SCOPE]).grantedScopes).toEqual([READ_SCOPE]);
  });

  it("permits a revocation that empties the grant", () => {
    const consumer = revokeConsumerScopes(active(), [READ_SCOPE]);
    expect(consumer.grantedScopes).toEqual([]);
    expect(consumerHoldsScope(consumer, READ_SCOPE)).toBe(false);
  });

  it("refuses an empty grant or revocation, which would say nothing", () => {
    expect(() => grantConsumerScopes(active(), [])).toThrow(EmptyScopeGrantError);
    expect(() => revokeConsumerScopes(active(), [])).toThrow(EmptyScopeGrantError);
  });

  it("compares scopes in their normalised form", () => {
    const consumer = active();
    expect(consumerHoldsScope(consumer, "  ADMISSIONS.Applications.Read ")).toBe(true);
  });

  it("refuses any scope change on a retired consumer", () => {
    const retired = retireApiConsumer(active());
    expect(() => grantConsumerScopes(retired, [WRITE_SCOPE])).toThrow(ConsumerRetiredError);
    expect(() => revokeConsumerScopes(retired, [READ_SCOPE])).toThrow(ConsumerRetiredError);
  });
});

describe("consumer lifecycle", () => {
  it("activates a registered consumer", () => {
    const consumer = active();
    expect(isApiConsumerActive(consumer)).toBe(true);
    expect(consumer.activatedAt).not.toBeNull();
  });

  it("suspends with a reason and reactivates, clearing the reason", () => {
    const suspended = suspendApiConsumer(active(), "Runaway retry loop on the reporting job");
    expect(isApiConsumerSuspended(suspended)).toBe(true);
    expect(suspended.suspensionReason).toBe("Runaway retry loop on the reporting job");
    expect(suspended.suspendedAt).not.toBeNull();

    const reactivated = activateApiConsumer(suspended);
    expect(isApiConsumerActive(reactivated)).toBe(true);
    expect(reactivated.suspensionReason).toBeNull();
  });

  it("refuses an unexplained suspension", () => {
    expect(() => suspendApiConsumer(active(), "   ")).toThrow(EmptyGatewayKeyError);
  });

  it("reports a repeated activation as a resubmission rather than a lifecycle error", () => {
    expect(() => activateApiConsumer(active())).toThrow(ConsumerAlreadyInStatusError);
  });

  it("refuses to suspend something that was never activated", () => {
    expect(() => suspendApiConsumer(registered(), "not yet live")).toThrow(
      InvalidConsumerProgressionError,
    );
  });

  it("retires from any status and never comes back", () => {
    for (const consumer of [registered(), active(), suspendApiConsumer(active(), "under review")]) {
      const retired = retireApiConsumer(consumer);
      expect(isApiConsumerRetired(retired)).toBe(true);
      expect(retired.retiredAt).not.toBeNull();
      expect(() => activateApiConsumer(retired)).toThrow(ConsumerRetiredError);
    }
  });

  it("refuses even harmless edits once retired", () => {
    const retired = retireApiConsumer(active());
    expect(() => renameApiConsumer(retired, "Legacy bridge")).toThrow(ConsumerRetiredError);
    expect(() => reassignApiConsumer(retired, SUCCESSOR_OWNER)).toThrow(ConsumerRetiredError);
  });

  it("never mutates the consumer it was handed", () => {
    const consumer = active();
    const before = { ...consumer, grantedScopes: [...consumer.grantedScopes] };
    suspendApiConsumer(consumer, "checking");
    grantConsumerScopes(consumer, [WRITE_SCOPE]);
    rotateConsumerCredential(consumer, "vault:other");
    expect({ ...consumer, grantedScopes: [...consumer.grantedScopes] }).toEqual(before);
  });
});

describe("ownership and labels", () => {
  it("renames without touching the key everything else refers to", () => {
    const renamed = renameApiConsumer(active(), "  District Bridge (legacy)  ");
    expect(renamed.displayName).toBe("District Bridge (legacy)");
    expect(renamed.consumerKey).toBe("district.reporting-bridge");
  });

  it("hands ownership on, which is what keeps the integration governable", () => {
    expect(reassignApiConsumer(active(), SUCCESSOR_OWNER).ownerId).toBe(SUCCESSOR_OWNER);
  });
});

describe("projection", () => {
  it("carries the handle outward and nothing that names a person or an instant", () => {
    const view = toConsumerView(active());
    expect(view).toEqual({
      consumerId: expect.any(String),
      consumerKey: "district.reporting-bridge",
      displayName: "District Reporting Bridge",
      authScheme: "oauth2_client_credentials",
      credentialRef: "vault:gateway/district-reporting-bridge",
      grantedScopes: [READ_SCOPE],
      status: "active",
    });
    expect(Object.keys(view)).not.toContain("ownerId");
    expect(Object.keys(view)).not.toContain("suspensionReason");
  });
});
