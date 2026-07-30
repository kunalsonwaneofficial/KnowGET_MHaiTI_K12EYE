/** Dependency-injection tokens for the API Gateway & Integration Fabric (P3-D01). */

// Repositories (Prisma/RLS adapters over the gateway ports).
export const GW_CONSUMER_REPOSITORY = Symbol("GW_CONSUMER_REPOSITORY");
export const GW_CONTRACT_REPOSITORY = Symbol("GW_CONTRACT_REPOSITORY");
export const GW_ROUTE_REPOSITORY = Symbol("GW_ROUTE_REPOSITORY");
export const GW_POLICY_REPOSITORY = Symbol("GW_POLICY_REPOSITORY");
export const GW_ENDPOINT_REPOSITORY = Symbol("GW_ENDPOINT_REPOSITORY");
export const GW_SUBSCRIPTION_REPOSITORY = Symbol("GW_SUBSCRIPTION_REPOSITORY");
export const GW_DELIVERY_REPOSITORY = Symbol("GW_DELIVERY_REPOSITORY");
export const GW_IDEMPOTENCY_REPOSITORY = Symbol("GW_IDEMPOTENCY_REPOSITORY");

// Cross-domain read ports. Organization and person are the usual node checks (P2-D01-M01, P2-D03). The scope
// catalogue answers from the role catalogue (P2-D01-M05), which is where the platform's permission vocabulary
// actually lives. The target directory answers from the capability catalogue (P2-D26), which is the one registry
// of things the platform can be asked to invoke — and it is what keeps *expose capabilities, never
// implementation* from being a slogan, because a route whose internal target names nothing is refused at
// registration rather than discovered on a caller's first request. The last two are declared at this composition
// root rather than read from a table: an adapter exists because code for it was written, and an event type is
// publishable because somebody decided to publish it.
export const GW_ORGANIZATION_DIRECTORY = Symbol("GW_ORGANIZATION_DIRECTORY");
export const GW_PERSON_DIRECTORY = Symbol("GW_PERSON_DIRECTORY");
export const GW_SCOPE_CATALOGUE = Symbol("GW_SCOPE_CATALOGUE");
export const GW_TARGET_DIRECTORY = Symbol("GW_TARGET_DIRECTORY");
export const GW_ADAPTER_REGISTRY = Symbol("GW_ADAPTER_REGISTRY");
export const GW_EVENT_TYPE_CATALOGUE = Symbol("GW_EVENT_TYPE_CATALOGUE");

// Application services.
export const GW_CONSUMER_SERVICE = Symbol("GW_CONSUMER_SERVICE");
export const GW_CONTRACT_SERVICE = Symbol("GW_CONTRACT_SERVICE");
export const GW_ROUTE_SERVICE = Symbol("GW_ROUTE_SERVICE");
export const GW_POLICY_SERVICE = Symbol("GW_POLICY_SERVICE");
export const GW_ENDPOINT_SERVICE = Symbol("GW_ENDPOINT_SERVICE");
export const GW_SUBSCRIPTION_SERVICE = Symbol("GW_SUBSCRIPTION_SERVICE");
export const GW_DELIVERY_SERVICE = Symbol("GW_DELIVERY_SERVICE");
export const GW_IDEMPOTENCY_SERVICE = Symbol("GW_IDEMPOTENCY_SERVICE");
