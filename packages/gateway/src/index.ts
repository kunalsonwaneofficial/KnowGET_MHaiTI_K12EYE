/**
 * `@knowget/gateway` — the platform's API gateway and integration fabric: its entire external surface, inbound
 * and outbound.
 *
 * Thirty contracts came before this one and every one of them models something the institution *does*. This one
 * models nothing the institution does. It decides what any of that work is allowed to look like from outside —
 * which capabilities an integrator can reach, under what contract, at what rate, with what guarantee that
 * calling twice charges once, and where the platform's own notifications go when something happens that
 * somebody else is waiting for.
 *
 * The contract's rule is that the platform exposes capabilities and never implementation, and this package
 * makes that structural rather than editorial. A published contract is immutable — a change of shape is a new
 * version beside it, because an integrator who built against a shape is entitled to keep finding it. And a
 * route's internal target appears in no view, event or error produced here, so no consumer can acquire a
 * dependency on where a capability currently lives, and the domain behind it can be refactored, split or moved
 * without one external caller learning that it happened.
 *
 * Four absences are deliberate and load-bearing. There is **no clock**: every instant a decision turns on
 * enters as an argument, so a rate-limit window, a retry schedule and an idempotency expiry are each decidable
 * without asking what time it is. There is **no unseeded randomness**: retry jitter is a hash of the delivery's
 * own identity, which spreads a thundering herd exactly as well as a random source would and reproduces the
 * schedule a support conversation is actually about. There is **no I/O**: nothing here holds an HTTP client,
 * opens a socket or signs a request — an endpoint is a protocol, an adapter key and a credential *reference*,
 * and whatever resolves those lives at the composition root. And there is **no secret**: a credential arriving
 * as plaintext is refused by the value objects rather than stored, because a gateway is precisely where a
 * leaked one is worth the most.
 *
 * What this package does not own matters as much as what it does. Rate-limit *counting* belongs to
 * `@knowget/security`, delivery *mechanics* to `@knowget/jobs`, the transactional outbox to `@knowget/events`,
 * and runtime retry, timeout and circuit execution to `@knowget/reliability`. This package holds the limit, not
 * the counter; the schedule, not the timer; the subscription, not the socket. Identity federation, AI provider
 * access and device transports are contracts of their own later in this phase, and each arrives behind an
 * adapter this fabric already describes.
 *
 * Domain events carry ids, keys, versions, statuses, decisions, reason codes and counts only. No payload, no
 * header, no secret, no URL and no idempotency key travels on the bus, because the bus fans out to subscribers
 * chosen for what they need to know rather than for what they are cleared to see.
 */

// --- Value objects ---------------------------------------------------------------

export * from "./gateway-value";

// --- Views -----------------------------------------------------------------------

export * from "./gateway-view";

// --- Engines ---------------------------------------------------------------------

export * from "./admission";
export * from "./backoff";
export * from "./circuit";
export * from "./lifecycle";
export * from "./negotiation";
export * from "./policy";
export * from "./quota";
export * from "./routing";

// --- Errors ----------------------------------------------------------------------

export * from "./errors";

// --- Aggregates ------------------------------------------------------------------

export * from "./api-consumer";
export * from "./api-contract";
export * from "./capability-route";
export * from "./idempotency-record";
export * from "./integration-endpoint";
export * from "./outbound-delivery";
export * from "./traffic-policy";
export * from "./webhook-subscription";

// --- Ports -----------------------------------------------------------------------

export * from "./ports";

// --- Events ----------------------------------------------------------------------

export * from "./gateway-events";

// --- Services --------------------------------------------------------------------

export * from "./api-consumer-service";
export * from "./api-contract-service";
export * from "./capability-route-service";
export * from "./idempotency-service";
export * from "./integration-endpoint-service";
export * from "./outbound-delivery-service";
export * from "./traffic-policy-service";
export * from "./webhook-subscription-service";
