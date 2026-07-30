import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { inspectCircuit } from "./circuit";
import {
  EmptyGatewayKeyError,
  EndpointNotAvailableError,
  EndpointRetiredError,
  InvalidEndpointProgressionError,
  InvalidGatewayKeyError,
  MissingAdapterKeyError,
  PlaintextCredentialError,
} from "./errors";
import type { OutcomeWindow } from "./gateway-view";
import {
  type IntegrationEndpoint,
  type RegisterIntegrationEndpointParams,
  activateIntegrationEndpoint,
  applyCircuitVerdict,
  disableIntegrationEndpoint,
  isEndpointQuarantineDue,
  isIntegrationEndpointCallable,
  quarantineIntegrationEndpoint,
  rebindEndpointAdapter,
  registerIntegrationEndpoint,
  renameIntegrationEndpoint,
  requireCallableEndpoint,
  retireIntegrationEndpoint,
  rotateEndpointCredential,
  toEndpointView,
} from "./integration-endpoint";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPENED = "2026-07-17T10:00:00.000Z" as ISODateString;

const params = (
  overrides: Partial<RegisterIntegrationEndpointParams> = {},
): RegisterIntegrationEndpointParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  endpointKey: "finance.payment-gateway",
  displayName: "Payment gateway",
  protocol: "https",
  adapterKey: "payments.hosted-checkout",
  credentialRef: "vault:integrations/payment-gateway",
  ...overrides,
});

const registered = (
  overrides: Partial<RegisterIntegrationEndpointParams> = {},
): IntegrationEndpoint => registerIntegrationEndpoint(params(overrides));

const active = (overrides: Partial<RegisterIntegrationEndpointParams> = {}): IntegrationEndpoint =>
  activateIntegrationEndpoint(registered(overrides));

const window = (overrides: Partial<OutcomeWindow> = {}): OutcomeWindow => ({
  successes: 0,
  failures: 0,
  consecutiveFailures: 0,
  posture: "closed",
  postureSince: OPENED,
  asOf: OPENED,
  ...overrides,
});

const observed = (endpoint: IntegrationEndpoint, over: OutcomeWindow): IntegrationEndpoint =>
  applyCircuitVerdict(endpoint, over, inspectCircuit(over));

describe("registering an endpoint", () => {
  it("starts registered, so the first call is not the test of the configuration", () => {
    const endpoint = registered();

    expect(endpoint.status).toBe("registered");
    expect(isIntegrationEndpointCallable(endpoint)).toBe(false);
    expect(endpoint.activatedAt).toBeNull();
  });

  it("knows nothing about the endpoint's health rather than assuming it is well", () => {
    const endpoint = registered();

    expect(endpoint.health).toBe("unknown");
    expect(endpoint.posture).toBe("closed");
    expect(endpoint.consecutiveFailures).toBe(0);
    expect(endpoint.lastOutcomeAt).toBeNull();
    expect(endpoint.circuitOpenedAt).toBeNull();
  });

  it("normalises the key everything else will refer to it by", () => {
    expect(registered({ endpointKey: "  Finance.Payment-Gateway  " }).endpointKey).toBe(
      "finance.payment-gateway",
    );
  });

  it("refuses an endpoint with no key and one that is not a key", () => {
    expect(() => registered({ endpointKey: "   " })).toThrow(EmptyGatewayKeyError);
    expect(() => registered({ endpointKey: "finance/payments" })).toThrow(InvalidGatewayKeyError);
  });
});

describe("the adapter", () => {
  it("refuses an endpoint with nothing in front of the vendor", () => {
    expect(() => registered({ adapterKey: "  " })).toThrow(MissingAdapterKeyError);
  });

  it("refuses an adapter key that is not a key", () => {
    expect(() => registered({ adapterKey: "payments checkout" })).toThrow(InvalidGatewayKeyError);
  });

  it("can be swapped while the endpoint is live, which is the point of the indirection", () => {
    const rebound = rebindEndpointAdapter(active(), "payments.direct-api");

    expect(rebound.adapterKey).toBe("payments.direct-api");
    expect(rebound.endpointKey).toBe("finance.payment-gateway");
    expect(rebound.status).toBe("active");
  });

  it("cannot be rebound once the endpoint is retired", () => {
    const retired = retireIntegrationEndpoint(registered());

    expect(() => rebindEndpointAdapter(retired, "payments.direct-api")).toThrow(
      EndpointRetiredError,
    );
  });
});

describe("the credential", () => {
  it("holds a handle and never a secret", () => {
    expect(() => registered({ credentialRef: "sk_live_4eC39Hq" })).toThrow(
      PlaintextCredentialError,
    );
  });

  it("names the field and not the value it rejected", () => {
    try {
      registered({ credentialRef: "sk_live_4eC39Hq" });
      expect.unreachable("a plaintext credential must be refused");
    } catch (error) {
      expect((error as PlaintextCredentialError).message).not.toContain("sk_live_4eC39Hq");
    }
  });

  it("permits an endpoint that needs no credential at all", () => {
    expect(registered({ credentialRef: null }).credentialRef).toBeNull();
  });

  it("reads a blank handle as no credential rather than as a handle to nothing", () => {
    expect(registered({ credentialRef: "   " }).credentialRef).toBeNull();
  });

  it("can be rotated without the aggregate learning what it now points at", () => {
    const rotated = rotateEndpointCredential(active(), "vault:integrations/payment-gateway-2026");

    expect(rotated.credentialRef).toBe("vault:integrations/payment-gateway-2026");
  });
});

describe("putting it into service", () => {
  it("lets the fabric call the endpoint", () => {
    const endpoint = active();

    expect(endpoint.status).toBe("active");
    expect(isIntegrationEndpointCallable(endpoint)).toBe(true);
    expect(endpoint.activatedAt).not.toBeNull();
  });

  it("refuses a call to anything that is not in service, naming which it is", () => {
    const disabled = disableIntegrationEndpoint(active(), "vendor contract ended");

    expect(() => requireCallableEndpoint(disabled)).toThrow(EndpointNotAvailableError);
    expect(() => requireCallableEndpoint(active())).not.toThrow();
  });

  it("resets the circuit, so failures that predate the fix do not outvote the fix", () => {
    const failing = observed(active(), window({ failures: 5, consecutiveFailures: 5 }));
    const quarantined = quarantineIntegrationEndpoint(failing);

    expect(quarantined.posture).toBe("open");

    const back = activateIntegrationEndpoint(quarantined);

    expect(back.posture).toBe("closed");
    expect(back.consecutiveFailures).toBe(0);
    expect(back.circuitOpenedAt).toBeNull();
  });

  it("records the last time it was put into service, not the first", () => {
    const first = active();
    const back = activateIntegrationEndpoint(disableIntegrationEndpoint(first, "migration"));

    expect(back.createdAt).toBe(first.createdAt);
    expect(Date.parse(back.activatedAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(first.activatedAt ?? ""),
    );
  });
});

describe("quarantine and disabling", () => {
  it("keeps the platform's conclusion apart from the operator's decision", () => {
    const quarantined = quarantineIntegrationEndpoint(active());
    const disabled = disableIntegrationEndpoint(active(), "vendor contract ended");

    expect(quarantined.status).toBe("quarantined");
    expect(quarantined.quarantinedAt).not.toBeNull();
    expect(quarantined.disabledReason).toBeNull();
    expect(disabled.status).toBe("disabled");
    expect(disabled.disabledReason).toBe("vendor contract ended");
  });

  it("will not disable an integration without saying why", () => {
    expect(() => disableIntegrationEndpoint(active(), "   ")).toThrow(EmptyGatewayKeyError);
  });

  it("leaves the observed health alone when quarantining, because it is the evidence", () => {
    const failing = observed(active(), window({ failures: 5, consecutiveFailures: 5 }));
    const quarantined = quarantineIntegrationEndpoint(failing);

    expect(quarantined.health).toBe("unreachable");
    expect(quarantined.consecutiveFailures).toBe(5);
  });

  it("never quarantines an endpoint nobody is calling", () => {
    const disabled = disableIntegrationEndpoint(active(), "migration in progress");

    expect(() => quarantineIntegrationEndpoint(disabled)).toThrow(InvalidEndpointProgressionError);
  });

  it("clears the absence it recorded when the endpoint comes back", () => {
    const back = activateIntegrationEndpoint(
      disableIntegrationEndpoint(active(), "vendor incident"),
    );

    expect(back.disabledAt).toBeNull();
    expect(back.disabledReason).toBeNull();
    expect(back.quarantinedAt).toBeNull();
  });

  it("ends the integration for good, from wherever it was", () => {
    const retired = retireIntegrationEndpoint(quarantineIntegrationEndpoint(active()));

    expect(retired.status).toBe("retired");
    expect(() => activateIntegrationEndpoint(retired)).toThrow(EndpointRetiredError);
    expect(() => renameIntegrationEndpoint(retired, "Anything")).toThrow(EndpointRetiredError);
  });
});

describe("recording what was observed", () => {
  it("writes health without taking the endpoint out of service", () => {
    const endpoint = observed(active(), window({ failures: 5, consecutiveFailures: 5 }));

    expect(endpoint.health).toBe("unreachable");
    expect(endpoint.posture).toBe("open");
    expect(endpoint.status).toBe("active");
    expect(isIntegrationEndpointCallable(endpoint)).toBe(true);
  });

  it("holds the moment the circuit opened through every probe that follows", () => {
    const failing = observed(active(), window({ failures: 5, consecutiveFailures: 5 }));

    expect(failing.circuitOpenedAt).toBe(OPENED);

    const later = "2026-07-17T10:20:00.000Z" as ISODateString;
    const probing = observed(
      failing,
      window({
        posture: "open",
        failures: 5,
        consecutiveFailures: 5,
        postureSince: OPENED,
        asOf: later,
      }),
    );

    expect(probing.posture).toBe("half_open");
    expect(probing.postureSince).toBe(later);
    expect(probing.circuitOpenedAt).toBe(OPENED);
  });

  it("starts the next outage's clock from the next outage", () => {
    const failing = observed(active(), window({ failures: 5, consecutiveFailures: 5 }));
    const recovered = observed(
      failing,
      window({
        posture: "half_open",
        successes: 3,
        postureSince: OPENED,
        asOf: "2026-07-17T10:30:00.000Z" as ISODateString,
      }),
    );

    expect(recovered.posture).toBe("closed");
    expect(recovered.circuitOpenedAt).toBeNull();
  });

  it("does not claim to have heard from a system nobody called", () => {
    const quiet = observed(active(), window());

    expect(quiet.lastOutcomeAt).toBeNull();
    expect(quiet.health).toBe("unknown");
  });

  it("moves the stamp when something was actually observed", () => {
    expect(observed(active(), window({ successes: 4 })).lastOutcomeAt).toBe(OPENED);
  });

  it("holds the posture stamp still when the posture did not change", () => {
    const endpoint = active();
    const steady = observed(
      endpoint,
      window({ successes: 4, asOf: "2026-07-17T11:00:00.000Z" as ISODateString }),
    );

    expect(steady.postureSince).toBe(endpoint.postureSince);
  });

  it("has nothing to record about a retired endpoint", () => {
    const retired = retireIntegrationEndpoint(active());

    expect(() => observed(retired, window({ successes: 1 }))).toThrow(EndpointRetiredError);
  });
});

describe("when quarantine is due", () => {
  const failing = (): IntegrationEndpoint =>
    observed(active(), window({ failures: 5, consecutiveFailures: 5 }));

  it("is not due while the outage is still an outage", () => {
    expect(isEndpointQuarantineDue(failing(), "2026-07-17T10:30:00.000Z" as ISODateString)).toBe(
      false,
    );
  });

  it("is due once the retries have stopped being worth making", () => {
    expect(isEndpointQuarantineDue(failing(), "2026-07-17T11:00:00.000Z" as ISODateString)).toBe(
      true,
    );
  });

  it("is never due for an endpoint whose circuit is closed", () => {
    expect(isEndpointQuarantineDue(active(), "2026-07-18T10:00:00.000Z" as ISODateString)).toBe(
      false,
    );
  });

  it("is never due for an endpoint nobody is calling", () => {
    const disabled = disableIntegrationEndpoint(failing(), "vendor incident");

    expect(isEndpointQuarantineDue(disabled, "2026-07-18T10:00:00.000Z" as ISODateString)).toBe(
      false,
    );
  });
});

describe("what an operator sees", () => {
  it("shows whether calls are going out, which health alone cannot say", () => {
    const disabled = disableIntegrationEndpoint(
      observed(active(), window({ successes: 40 })),
      "vendor contract ended",
    );
    const view = toEndpointView(disabled);

    expect(view.status).toBe("disabled");
    expect(view.health.health).toBe("healthy");
  });

  it("names the adapter and the transport, and no vendor", () => {
    const view = toEndpointView(active());

    expect(view.adapterKey).toBe("payments.hosted-checkout");
    expect(view.protocol).toBe("https");
    expect(view.displayName).toBe("Payment gateway");
  });

  it("keeps the outbound credential handle off the screen", () => {
    expect(Object.keys(toEndpointView(active()))).not.toContain("credentialRef");
  });

  it("carries the observed standing an operator would act on", () => {
    const view = toEndpointView(
      observed(active(), window({ failures: 5, consecutiveFailures: 5 })),
    );

    expect(view.health).toEqual({
      health: "unreachable",
      posture: "open",
      consecutiveFailures: 5,
      lastOutcomeAt: OPENED,
    });
  });

  it("hands back a projection nothing downstream can edit", () => {
    expect(Object.isFrozen(toEndpointView(active()))).toBe(true);
  });
});
