import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import { isUuid } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * Permissions gating the predictive layer's REST surface (P2-D28). Five scopes, and the split is this
 * contract's governing rule — a forecast carries its intervals, its assumptions, its uncertainty, and
 * reproduces — expressed as authorization rather than as advice.
 *
 * `forecast:record` is the evidence surface: declaring a series, recording observations into it, correcting
 * or withdrawing one, closing and reopening. It is listed first because it is the one scope that can change
 * what everything downstream already stood on. A corrected observation is a retroactive edit to the history
 * every published model was fitted against and every backtest was scored on, so the ability to touch it is
 * not the ability to run a projection and is not granted by it.
 *
 * `forecast:manage` is the method and case surface: drafting, amending, revising, publishing and retiring
 * forecast models, and declaring, levering, publishing and archiving scenarios. It settles what the
 * institution is permitted to project with and which cases it will entertain — decided ahead of time, by
 * people who answer for the method, and never in the middle of producing an answer with it.
 *
 * `forecast:operate` is the runtime surface: producing forecast runs, re-verifying that a run still
 * reproduces, invalidating one that no longer does, superseding it, scoring a model against holdout history
 * and running a published scenario against a standing forecast. It works the machinery; it does not decide
 * what the machinery may contain. Publication is deliberately not here even though it cites a backtest,
 * because the aggregate refuses a backtest that did not beat the naive baseline — an operator cannot
 * manufacture publishability, so the gate that matters is the score and not the second signature.
 *
 * `forecast:plan` is where the institution commits: drafting a strategic plan, setting objectives on it,
 * activating it, recording actual progress and reviewing it against the forecast. These are leadership acts
 * with consequences an institution answers for, and they are not implied by the ability to produce the
 * projection a target is set from.
 *
 * `forecast:read` is every read: series and their observations, models and versions, runs and their
 * uncertainty, backtest scores, scenarios, simulated outcomes, plans and their variance. Deliberately wide,
 * because a forecast nobody may inspect fails this contract's rule as surely as one carrying no intervals —
 * an observer who can neither record, author, run nor commit still sees exactly what was projected, on what
 * assumptions, with what confidence, and whether it held.
 */
export const FORECAST_READ = "forecast:read";
export const FORECAST_RECORD = "forecast:record";
export const FORECAST_MANAGE = "forecast:manage";
export const FORECAST_OPERATE = "forecast:operate";
export const FORECAST_PLAN = "forecast:plan";

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
 * The user the platform will hold to a projection — who produced a forecast run, who scored a model, who ran
 * a scenario, who activated or reviewed a plan.
 *
 * Taken from the authenticated principal and never from the body, anywhere in this domain. A forecast that
 * reproduces is only half of what this contract asks for; the other half is knowing whose judgement stood
 * behind the assumptions it was produced under, and an author a caller could type in is a field rather than
 * an accountability record. An unidentifiable principal is refused here instead of being recorded as nobody.
 */
export function actorOf(principal: Principal): Uuid {
  const actor = principal.id.trim();
  if (!actor || !isUuid(actor)) {
    throw new ValidationError("No user is associated with the current principal");
  }
  return actor as Uuid;
}

/**
 * A published model version as a URL carries it.
 *
 * The only numeric path parameter in this domain, and it earns the exception. A run made three years ago pins
 * `modelKey` and `modelVersion` and nothing else about its method, so "show me exactly the version that
 * produced this" is the read that makes such a run auditable rather than merely archived — and a version is
 * the natural identifier of a frozen thing, not a filter over a collection.
 *
 * Parsed strictly rather than through `Number`, which reads `"7abc"` as `7`, `""` as `0` and `" 7"` as `7`. A
 * version that silently became a different version would answer an audit with the wrong method, which is a
 * worse outcome than refusing to answer. Only positive integers are admissible because only published
 * versions have one: every draft of a key sits at `0`, so a lookup there identifies nothing.
 */
export function versionOf(value: string): number {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new ValidationError("A model version must be a positive integer", {
      details: { version: value },
    });
  }
  return Number(value);
}
