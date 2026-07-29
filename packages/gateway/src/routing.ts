import { type HttpMethod, MAX_EXTERNAL_PATH_LENGTH, normalizeKey } from "./gateway-value";
import type {
  PathIssue,
  PathVerdict,
  RouteCandidate,
  RouteRefusal,
  RouteResolution,
  RouteResolutionRequest,
} from "./gateway-view";

/**
 * How an inbound call becomes a route, and what an external path is allowed to look like.
 *
 * The engine answers one question — *which published route, if any, does this call address* — and it answers it
 * without a repository, a clock or an exception. Candidates are handed in; a verdict comes back. That shape is
 * what lets the whole resolution table be exercised in a unit test rather than through a running server, and it
 * is what lets a support conversation about a call that four-oh-foured last Tuesday be settled by replaying the
 * routes as they stood rather than as they stand.
 *
 * **The engine never sees an internal target.** {@link resolveRoute} takes {@link RouteCandidate} values, each
 * carrying a route id and a *public* view, and returns the id of the one that matched. Dispatching means looking
 * that id up inside the platform, where the target lives. This is the contract's rule — expose capabilities,
 * never implementation — enforced by the type of the argument rather than by a reviewer noticing. A future
 * change that wanted to return a target from here would have to widen the input first, which is a change nobody
 * makes by accident.
 *
 * **The three refusals are three different conversations.** An unknown capability means the integrator is
 * calling something this institution does not offer. An unknown version means they are calling something it
 * offers, at a version it does not serve — usually a pin that has been sunset. A method that is not published
 * means they have the resource right and the verb wrong. Collapsing them into a single *not found* would be
 * correct at the transport layer and useless at every layer above it.
 *
 * **Only active routes are candidates for resolution.** A draft route is invisible: a capability whose routes
 * are all drafts resolves as an unknown capability rather than as an unknown version, because a version nobody
 * has published is a version no integrator has seen, and hinting at it would publish the roadmap through the
 * error channel.
 */

// --- External paths --------------------------------------------------------------

/** A literal path segment: lowercase, and no punctuation that means something to a router or a shell. */
const LITERAL_SEGMENT = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/** A path parameter: `{name}`, where the name is a camelCase identifier such as `applicationId`. */
const PARAMETER_SEGMENT = /^\{[a-z][a-zA-Z0-9]*\}$/;

/** Whether a segment is written as a parameter, however well or badly it is written. */
const looksLikeParameter = (segment: string): boolean =>
  segment.startsWith("{") || segment.endsWith("}");

/** A refusal with the parameters found so far discarded, because a rejected template binds nothing. */
const refusePath = (issue: PathIssue): PathVerdict =>
  Object.freeze({ valid: false, issue, parameters: Object.freeze([]) as readonly string[] });

/**
 * Whether an external path may be published, and which parameters it binds.
 *
 * The checks run outermost-first — shape of the whole string, then shape of each segment, then the relationship
 * between segments — so that the issue reported is the one the author would fix first. A template with a
 * trailing slash *and* a duplicate parameter is reported as the trailing slash, because that is what they will
 * see when they look at it.
 *
 * A trailing slash is refused rather than trimmed. `/v2/students/` and `/v2/students` are the same resource to
 * every integrator and two different rows here, and the pair would resolve identically right up until somebody
 * retired one of them.
 *
 * Parameter names are camelCase while literal segments are lowercase, and the asymmetry is deliberate: the two
 * are read by different audiences. A literal segment is part of a URL, where case is a source of support
 * tickets; a parameter name is a variable an integrator binds in their own code, where `applicationId` is what
 * they expect and `applicationid` is what they will mistype.
 */
export function inspectExternalPath(path: string): PathVerdict {
  const trimmed = path.trim();

  if (!trimmed.startsWith("/")) return refusePath("not_absolute");
  if (trimmed.length > MAX_EXTERNAL_PATH_LENGTH) return refusePath("too_long");
  if (trimmed.length > 1 && trimmed.endsWith("/")) return refusePath("trailing_slash");

  const segments = trimmed.slice(1).split("/");
  const parameters: string[] = [];

  for (const segment of segments) {
    if (segment.length === 0) return refusePath("empty_segment");

    if (looksLikeParameter(segment)) {
      if (!PARAMETER_SEGMENT.test(segment)) return refusePath("malformed_parameter");
      const name = segment.slice(1, -1);
      if (parameters.includes(name)) return refusePath("duplicate_parameter");
      parameters.push(name);
      continue;
    }

    if (!LITERAL_SEGMENT.test(segment)) return refusePath("malformed_segment");
  }

  return Object.freeze({ valid: true, issue: null, parameters: Object.freeze(parameters) });
}

// --- Resolution ------------------------------------------------------------------

/** A refusal carries no route and no view, so that a caller cannot read one out of a failed resolution. */
const refuseResolution = (refusal: RouteRefusal): RouteResolution =>
  Object.freeze({ resolved: false, routeId: null, view: null, refusal });

/**
 * Which published route a call addresses, or why none of them does.
 *
 * The capability and the version are normalised before comparison and the method is not, which follows the two
 * grammars rather than being an inconsistency: keys are lowercase by definition in this package, and request
 * methods are uppercase by definition in the protocol. A caller that has already uppercased the method — which
 * every transport does before this is reached — gets a match; one that has not gets `method_not_published`,
 * which is the correct answer to a request for `get`.
 *
 * Candidates are filtered to active routes before anything else is decided, and the narrowing then runs
 * capability, version, method in that order. Each step is a strictly smaller set than the last, so the refusal
 * reported is always about the first thing that was actually missing rather than about the last thing checked.
 */
export function resolveRoute(
  request: RouteResolutionRequest,
  candidates: readonly RouteCandidate[],
): RouteResolution {
  const capabilityKey = normalizeKey(request.capabilityKey);
  const contractVersion = normalizeKey(request.contractVersion);

  const active = candidates.filter((candidate) => candidate.view.status === "active");

  const byCapability = active.filter((candidate) => candidate.view.capabilityKey === capabilityKey);
  if (byCapability.length === 0) return refuseResolution("unknown_capability");

  const byVersion = byCapability.filter(
    (candidate) => candidate.view.contractVersion === contractVersion,
  );
  if (byVersion.length === 0) return refuseResolution("unknown_version");

  const matched = byVersion.find((candidate) => candidate.view.method === request.method);
  if (matched === undefined) return refuseResolution("method_not_published");

  return Object.freeze({
    resolved: true,
    routeId: matched.routeId,
    view: matched.view,
    refusal: null,
  });
}

/**
 * The methods published for a capability at a version, in the order the platform's vocabulary lists them.
 *
 * This exists so that a `method_not_published` refusal can be answered with *these are the methods that do
 * work*, which is the difference between a support ticket and a corrected line of code. It reads only public
 * views, so the answer is safe to hand to the caller who provoked it.
 */
export function publishedMethods(
  capabilityKey: string,
  contractVersion: string,
  candidates: readonly RouteCandidate[],
): readonly HttpMethod[] {
  const capability = normalizeKey(capabilityKey);
  const version = normalizeKey(contractVersion);

  const methods: HttpMethod[] = [];
  for (const candidate of candidates) {
    if (candidate.view.status !== "active") continue;
    if (candidate.view.capabilityKey !== capability) continue;
    if (candidate.view.contractVersion !== version) continue;
    if (!methods.includes(candidate.view.method)) methods.push(candidate.view.method);
  }
  return Object.freeze(methods);
}
