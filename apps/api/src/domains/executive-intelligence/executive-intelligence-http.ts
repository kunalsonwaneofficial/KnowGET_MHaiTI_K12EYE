import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * Permissions gating the command layer's REST surface (P2-D29). Five scopes, and the split is this contract's
 * governing rule — role-aware dashboards, a reproducible index, evidence-traceable KPIs — expressed as
 * authorization rather than as advice.
 *
 * `command:measure` is the evidence surface: recording a KPI reading and withdrawing one. It is listed first
 * because it is the only scope that can change a figure the institution has already reported. A withdrawal is a
 * retroactive edit to the history every filed assessment consumed and every issued briefing pinned, so the
 * ability to touch it is not the ability to run an assessment and is not granted by it.
 *
 * `command:manage` is the instrument surface: defining indicators, revising their scale, renaming, retargeting,
 * activating and retiring them; defining index compositions, reweighting, publishing, superseding, recomposing
 * and retiring them; and authoring dashboards, setting their panels, publishing and archiving them. It settles
 * what the institution measures itself by and who is served which view of the answer — decided ahead of time, by
 * people who answer for the method, and never in the middle of producing a number with it. Panel authorship is
 * here rather than under a viewing scope for exactly that reason: the binding of a panel to a required scope
 * *is* the role-awareness, so someone who could rebind panels could grant themselves any view by editing the
 * page rather than by being given access to it.
 *
 * `command:operate` is the runtime surface: computing an assessment, finalizing it, invalidating one that no
 * longer stands, and working the attention queue — sweeping, raising, restating, acknowledging, resolving and
 * dismissing. Raising a finding is arithmetic the engines already decided, and working the queue is the
 * operational response to it, so the two belong to the same hands. Dismissal sits here and not higher up
 * deliberately: what protects a dismissal is that the aggregate records a reason and the name of whoever signed
 * it, not that the act is rarer than the others.
 *
 * `command:brief` is the outward-facing surface: drafting an executive briefing, revising it, setting its
 * findings, issuing it and withdrawing it. Telling a board something is a different act from computing it, and
 * this is the one place in the contract where a document leaves the institution under its name.
 *
 * `command:read` is every read: indicators and their readings, compositions, assessments and their reproduction
 * verdicts, dashboards, briefings and the attention queue. Deliberately wide, because an index nobody may
 * inspect fails this contract's rule as surely as one nobody can reproduce — a reader who can neither measure,
 * author, operate nor publish still sees exactly what the institution scored, on what evidence, under which
 * composition, and whether it reproduces.
 *
 * Panel and briefing scopes are a *separate* vocabulary from these five, and are not drawn from them. A panel
 * may require `finance:read` and a briefing may be addressed to `governance:board`; the domain compares them
 * against whatever the principal holds without knowing where any of it came from. These five gate the routes;
 * the panel and audience scopes gate what a permitted read returns.
 */
export const COMMAND_READ = "command:read";
export const COMMAND_MEASURE = "command:measure";
export const COMMAND_MANAGE = "command:manage";
export const COMMAND_OPERATE = "command:operate";
export const COMMAND_BRIEF = "command:brief";

interface ZodLike<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: unknown } };
}

/** Parse a request body with a zod schema, mapping failure to a 400 ValidationError. */
export function parseBody<T>(schema: ZodLike<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", { details: { issues: result.error.issues } });
  }
  return result.data;
}

/** The tenant of the current principal, or a 400 when none is associated. */
export function tenantOf(principal: Principal): TenantId {
  if (!principal.tenantId) {
    throw new ValidationError("No tenant is associated with the current principal");
  }
  return principal.tenantId;
}

/**
 * The user the platform will hold to a governance act — who acknowledged a finding, who resolved it, who
 * dismissed it and therefore whose judgement the institution is relying on that it did not matter.
 *
 * Taken from the authenticated principal and never from the body, anywhere in this domain. An attention item
 * closed by a name a caller could type in is a field rather than an accountability record, and the entire
 * reason the queue refuses deletion is so that closures carry a signature. An unidentifiable principal is
 * refused here rather than recorded as nobody.
 */
export function actorOf(principal: Principal): Uuid {
  const actor = principal.id.trim();
  if (!actor || !isUuid(actor)) {
    throw new ValidationError("No user is associated with the current principal");
  }
  return actor as Uuid;
}

/**
 * A reporting period as a URL carries it.
 *
 * Periods are ordinals on a grid the institution declares — not dates — because nothing in this domain holds a
 * clock: every staleness, trend and sustained-decline decision the engines make is subtraction between two
 * integers. A calendar value arriving here would have to be interpreted onto that grid, and interpreting it is a
 * reporting decision the transport layer has no standing to make.
 *
 * Parsed strictly rather than through `Number`, which reads `"202401x"` as `202401`, `""` as `0` and `" 5"` as
 * `5`. A period that silently became a different period would answer a governance question with the wrong
 * quarter's figure, which is worse than refusing to answer at all. Negative ordinals are admissible: an
 * institution numbering backwards from an established origin is ordinary, and refusing it here would push
 * institutions into renumbering their own history to satisfy a URL.
 */
export function periodOf(value: string): number {
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new ValidationError("A reporting period must be an integer ordinal", {
      details: { period: value },
    });
  }
  return Number(value);
}

/**
 * The scopes a reader actually holds, for the two reads that are role-aware rather than merely permitted.
 *
 * Dashboards compose down to the panels a reader's scopes reach and briefings are filtered to the documents
 * addressed to them, so both need the granted set and not just the verdict that the route was allowed. The
 * principal's permissions are that set verbatim — the domain lowercases and trims before comparing, so nothing
 * needs normalizing here, and normalizing anyway would mean two places deciding what a scope is.
 *
 * Deliberately the principal's own permissions rather than anything the caller supplies. A `grantedScopes`
 * parameter reaching this layer from a request body would let any reader compose the dashboard of any role, and
 * the role-awareness the contract asks for would be a display convention rather than a boundary.
 */
export function scopesOf(principal: Principal): readonly string[] {
  return principal.permissions;
}
