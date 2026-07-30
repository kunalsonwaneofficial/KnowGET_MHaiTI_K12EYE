import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { IdempotencyRecordNotFoundError } from "./errors";
import { idempotencyConflictDetected } from "./gateway-events";
import type { IdempotencyDisposition, IdempotencyVerdict } from "./gateway-view";
import {
  type BeginIdempotentOperationParams,
  type IdempotencyRecord,
  type OperationResult,
  beginIdempotentOperation,
  completeIdempotentOperation,
  inspectIdempotency,
  markIdempotencyConflict,
  requireIdempotencyKey,
  requireUsableIdempotency,
} from "./idempotency-record";
import type { IdempotencyRecordRepository } from "./ports";

/** What the ledger decided about a key, and the record that decision was made against. */
export interface GuardedOperation {
  /** `proceed` to do the work and complete the record afterwards; `replay` to answer with what it already holds. */
  readonly disposition: Extract<IdempotencyDisposition, "proceed" | "replay">;
  /** The record to complete when the work finishes, or the settled record whose answer is being replayed. */
  readonly record: IdempotencyRecord;
  /** The verdict in full, carrying the recorded status and the expiry flag a metric is built on. */
  readonly verdict: IdempotencyVerdict;
}

/**
 * Application service for the idempotency ledger — the platform's memory that a named operation has already been
 * attempted, and what came of it.
 *
 * **This service checks nothing through a directory, and that is the one place it departs from every other service
 * in this package.** A record is written in the middle of a request the admission engine has already resolved: the
 * route matched, the consumer was found by its credential, the consumer was active, it held the scope, and the
 * traffic policy let the request through. The consumer id and organization id on the parameters are the ones
 * admission produced, not ones a caller typed. Re-asking those questions here would put two directory lookups on
 * the hottest path in the package — one row per guarded write, on every mutating request the institution serves —
 * to confirm something the request could not have reached this point without.
 *
 * The stronger argument is what a failure would have to mean. If such a check somehow failed, refusing the write
 * would be the wrong response, because the operation itself is about to happen either way: the caller would end up
 * doing the work unguarded, or failing after having done it. A row recorded against an id nobody can resolve is a
 * far better outcome than a mutation nobody can deduplicate.
 *
 * **{@link IdempotencyService.begin} is the only door, and it makes the decision rather than reporting it.** The
 * lookup, the verdict and the claim are one operation because they are one question — *may I do this?* — and
 * splitting them would leave every composition root writing the same four-branch reduction, each with its own idea
 * of which branches are errors. What comes back is either a record to complete or an earlier answer to replay;
 * waiting and colliding leave as exceptions, because neither has a result the caller can act on.
 *
 * **A collision is announced whenever one is found, and poisons the record only where the aggregate allows it.**
 * Those are two different judgements and they are deliberately not the same. Announcing is about the client: a key
 * reused across two distinct payloads is a key-generation defect, and it is worth hearing about whether the
 * record it collided with was still running or finished last week. Poisoning is about the record: an `in_flight`
 * one has no honest answer for either caller and is marked conflicted, a `completed` one has an answer that
 * belongs to a known request and is left exactly as it stands, so the original caller's retry still replays.
 *
 * **A record left in flight by a crashed process is released by retention, not by this service.** There is no
 * method to abandon one, because the aggregate offers no transition out of `in_flight` other than completing or
 * colliding, and inventing one here would hand an operator a way to unlock a key whose operation may still be
 * running — which is the duplicate charge this whole module exists to prevent, arrived at through the support
 * queue. A caller retrying under a key whose first attempt died waits out
 * {@link IdempotencyService.purgeExpired}'s window, and the `expired` flag on the verdict is what tells the
 * platform that window is set wrong.
 */
export interface IdempotencyServiceDeps {
  readonly repository: IdempotencyRecordRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class IdempotencyService {
  private readonly repository: IdempotencyRecordRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: IdempotencyServiceDeps) {
    this.repository = deps.repository;
    this.events = deps.events;
  }

  // --- Guarding --------------------------------------------------------------------

  /**
   * Claim a key for one request, or hand back the answer an earlier one already produced.
   *
   * The key is validated before the lookup, because it is the lookup's argument and because a malformed one is
   * the caller's mistake rather than a question about the ledger. Everything after that is the verdict's: a
   * record already conflicted, one holding a different fingerprint, or one whose stored key differs from the key
   * asked for all leave as {@link IdempotencyKeyConflictError}, and one still running leaves as
   * {@link OperationInFlightError}.
   *
   * The two survivors are returned rather than distinguished by type, because a caller acts on both — `proceed`
   * by doing the work and calling {@link IdempotencyService.complete}, `replay` by answering from
   * `verdict.recordedStatus` and the record's `responseRef` — and a caller that forgets to look at the
   * disposition has a bug that a union type would only move.
   */
  async begin(params: BeginIdempotentOperationParams): Promise<GuardedOperation> {
    const idempotencyKey = requireIdempotencyKey(params.idempotencyKey);
    const existing = await this.repository.findByKey(
      params.tenantId,
      params.consumerId,
      idempotencyKey,
    );
    const verdict = inspectIdempotency(existing, {
      idempotencyKey,
      payloadFingerprint: params.payloadFingerprint,
      asOf: params.asOf,
    });

    if (verdict.disposition === "conflict" && existing) {
      await this.announceConflict(existing, params.asOf);
    }
    requireUsableIdempotency(verdict, idempotencyKey);

    if (verdict.disposition === "replay" && existing) {
      return { disposition: "replay", record: existing, verdict };
    }

    const record = beginIdempotentOperation({ ...params, idempotencyKey });
    await this.repository.save(record);
    return { disposition: "proceed", record, verdict };
  }

  /**
   * Record what the operation produced, so the next arrival of the same request is answered rather than repeated.
   *
   * Nothing is announced. A completion is the ordinary end of every guarded write the institution serves, and an
   * event per mutating request is a firehose that tells a subscriber only that the platform is being used.
   */
  async complete(
    tenantId: TenantId,
    id: Uuid,
    result: OperationResult,
    at: ISODateString,
  ): Promise<IdempotencyRecord> {
    const next = completeIdempotentOperation(await this.require(tenantId, id), result, at);
    await this.repository.save(next);
    return next;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One record, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<IdempotencyRecord> {
    return this.require(tenantId, id);
  }

  /**
   * One record by the pair it is addressed with, or a 404.
   *
   * The read an operator performs while investigating a duplicate: they hold the key from the integrator's logs
   * and the consumer it was presented under. The key is trimmed and otherwise preserved, exactly as the write
   * path preserves it, so a support conversation about a key is about the same string on both sides.
   */
  async getByKey(
    tenantId: TenantId,
    consumerId: Uuid,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord> {
    const key = requireIdempotencyKey(idempotencyKey);
    const record = await this.repository.findByKey(tenantId, consumerId, key);
    if (!record) {
      throw new IdempotencyRecordNotFoundError(key);
    }
    return record;
  }

  /**
   * Every guarded write one integration has made, in every state.
   *
   * The widest read this service offers, and deliberately the widest one it can offer: the port carries no
   * tenant-wide list, because this table takes a row per guarded write and materialising all of them is not a
   * report. What an operator actually asks is what this integration has been doing, and that is bounded by the
   * integration.
   */
  async listByConsumer(
    tenantId: TenantId,
    consumerId: Uuid,
  ): Promise<readonly IdempotencyRecord[]> {
    return this.repository.listByConsumer(tenantId, consumerId);
  }

  // --- Housekeeping ----------------------------------------------------------------

  /**
   * Drop records whose retention has run out, and say how many went.
   *
   * Housekeeping rather than enforcement. {@link inspectIdempotency} already treats an expired record as absent,
   * so this can run late, run early or not run for a month without changing a single answer the ledger gives —
   * it reclaims space, and the count is what a scheduled job reports.
   */
  async purgeExpired(tenantId: TenantId, asOf: ISODateString): Promise<number> {
    return this.repository.purgeExpired(tenantId, asOf);
  }

  // --- Internals -------------------------------------------------------------------

  /** The record under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<IdempotencyRecord> {
    const record = await this.repository.findById(tenantId, id);
    if (!record) {
      throw new IdempotencyRecordNotFoundError(id);
    }
    return record;
  }

  /**
   * Tell the platform a key collided, marking the record first where the aggregate permits it.
   *
   * The announcement carries whatever state the record is in when the collision lands, which is why the marking
   * happens before the event and not after: a record that was in flight is announced as conflicted, with the
   * instant it became so, and one that was already completed is announced as completed. A subscriber counting
   * client defects wants both; a subscriber deciding whether anybody is stuck can tell them apart.
   */
  private async announceConflict(record: IdempotencyRecord, at: ISODateString): Promise<void> {
    if (record.state !== "in_flight") {
      await this.emit(idempotencyConflictDetected(record));
      return;
    }
    const conflicted = markIdempotencyConflict(record, at);
    await this.repository.save(conflicted);
    await this.emit(idempotencyConflictDetected(conflicted));
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
