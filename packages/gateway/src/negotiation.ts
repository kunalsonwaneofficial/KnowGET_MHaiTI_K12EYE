import type { ISODateString } from "@knowget/types";
import { normalizeKey } from "./gateway-value";
import type {
  NegotiationRefusal,
  OfferedVersion,
  VersionRequest,
  VersionVerdict,
} from "./gateway-view";
import { inspectServing } from "./lifecycle";

/**
 * Which version of a capability a caller is seated on, and what they should be told about it.
 *
 * Negotiation is the quietest part of a gateway and the part that decides whether the platform can ever change.
 * A caller that pins a version gets that version until it is sunset, which is the promise the contract lifecycle
 * exists to keep. A caller that pins nothing gets a default, and the whole question is which one — because that
 * default is what every integration written in a hurry ends up depending on without knowing it.
 *
 * **The default is the newest version that is not on notice.** Not simply the newest: a caller who never named a
 * version has expressed no opinion about migration, and seating them on a version that has already been
 * announced for sunset would enrol them in a deadline they did not agree to and will not read about. Only when
 * every servable version is on notice does the default fall back to the newest of those, because serving
 * something with a warning beats refusing a caller who asked for nothing in particular.
 *
 * **A deprecated version is served when it is asked for by name.** Someone who pinned `v2` knows what they
 * pinned. Refusing them early would be the platform deciding their migration schedule; what the verdict does
 * instead is carry the notice — {@link VersionVerdict.deprecated} and the sunset date — so the transport can
 * tell them on every single call rather than in an email they filtered.
 *
 * **Ordering is by the numbers in the version, then by the text.** {@link compareContractVersions} reads the
 * digit runs in order — so `v2` precedes `v10`, which a lexical sort gets backwards, and `2.1.0` precedes
 * `2.1.3` — and falls back to plain code-point comparison when the numbers tie or there are none. A version with
 * no digits in it at all, such as `beta`, therefore sorts below every numbered version, which is the right place
 * for it and worth knowing before naming one that way.
 *
 * Nothing here reads a clock. `asOf` arrives on the request, so *which version would a caller have been seated
 * on in March* is a question this engine answers rather than one it approximates.
 */

// --- Ordering --------------------------------------------------------------------

/** The digit runs in a version, in order: `v2.1.0` reads as 2, 1, 0 and `beta` reads as nothing at all. */
const numericParts = (version: string): readonly number[] =>
  (version.match(/\d+/g) ?? []).map((part) => Number.parseInt(part, 10));

/**
 * Order two contract versions oldest-first.
 *
 * Numeric before lexical, because the failure a lexical-only sort produces is specific and embarrassing: `v10`
 * sorts before `v2`, so the tenth version of a capability becomes unreachable as a default on the day it is
 * published and nobody notices until an integrator asks why the newest version is not the one they get.
 *
 * The fallback is code-point comparison rather than {@link String.prototype.localeCompare}, which is
 * locale-sensitive: a platform whose default version depended on the server's locale would sort differently in
 * two data centres, and the resulting bug would be reproducible in neither.
 */
export function compareContractVersions(left: string, right: string): number {
  const leftParts = numericParts(left);
  const rightParts = numericParts(right);

  const depth = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < depth; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }

  if (left === right) return 0;
  return left < right ? -1 : 1;
}

// --- Selection -------------------------------------------------------------------

/** A refusal seats nobody, so it carries no version and no date to be mistaken for one. */
const refuse = (refusal: NegotiationRefusal): VersionVerdict =>
  Object.freeze({
    seated: false,
    servedVersion: null,
    deprecated: false,
    sunsetAt: null,
    refusal,
  });

/** Seat a caller on a version, carrying the notice when there is one to carry. */
const seat = (version: OfferedVersion, deprecated: boolean): VersionVerdict =>
  Object.freeze({
    seated: true,
    servedVersion: version.contractVersion,
    deprecated,
    sunsetAt: deprecated ? version.sunsetAt : null,
    refusal: null,
  });

/** The newest of a set, by the package's version ordering. Empty in means `null` out. */
const newest = (versions: readonly OfferedVersion[]): OfferedVersion | null =>
  versions.reduce<OfferedVersion | null>(
    (best, version) =>
      best === null || compareContractVersions(version.contractVersion, best.contractVersion) > 0
        ? version
        : best,
    null,
  );

/**
 * The version a caller who named none would be seated on, or `null` when nothing is servable.
 *
 * Exported because the capability catalogue answers the same question — *which version should I write against*
 * — and two implementations of that answer would eventually disagree, at which point the documentation would be
 * telling integrators to use a version the gateway does not hand out.
 */
export function latestServableVersion(
  offered: readonly OfferedVersion[],
  asOf: ISODateString,
): OfferedVersion | null {
  const current: OfferedVersion[] = [];
  const onNotice: OfferedVersion[] = [];

  for (const version of offered) {
    const verdict = inspectServing({
      status: version.status,
      deprecatedAt: version.deprecatedAt,
      sunsetAt: version.sunsetAt,
      asOf,
    });
    if (!verdict.served) continue;
    if (verdict.deprecated) onNotice.push(version);
    else current.push(version);
  }

  return newest(current) ?? newest(onNotice);
}

// --- Negotiation -----------------------------------------------------------------

/**
 * Seat a caller on a version, or say why none of them will do.
 *
 * The three refusals separate three situations that a single *not found* would blur. Nothing offered at all
 * means the capability exists but has no versions — a configuration state, not a caller error. An unknown
 * version means they named one that was never offered, usually a typo or a copied example. Not servable means
 * they named one that exists and has stopped answering, which is the sunset working exactly as announced and
 * the one case where the answer is *migrate*.
 *
 * A named version is checked against {@link inspectServing} rather than against its status alone, so a
 * deprecated version whose sunset has passed refuses even if nobody has got round to moving its status to
 * `sunset`. The date is the announcement; the status is bookkeeping that follows it.
 */
export function negotiateVersion(request: VersionRequest): VersionVerdict {
  if (request.offered.length === 0) return refuse("no_versions_offered");

  if (request.requested === null) {
    const selected = latestServableVersion(request.offered, request.asOf);
    if (selected === null) return refuse("version_not_servable");

    const verdict = inspectServing({
      status: selected.status,
      deprecatedAt: selected.deprecatedAt,
      sunsetAt: selected.sunsetAt,
      asOf: request.asOf,
    });
    return seat(selected, verdict.deprecated);
  }

  const requested = normalizeKey(request.requested);
  const named = request.offered.find((version) => version.contractVersion === requested);
  if (named === undefined) return refuse("unknown_version");

  const verdict = inspectServing({
    status: named.status,
    deprecatedAt: named.deprecatedAt,
    sunsetAt: named.sunsetAt,
    asOf: request.asOf,
  });
  if (!verdict.served) return refuse("version_not_servable");

  return seat(named, verdict.deprecated);
}
