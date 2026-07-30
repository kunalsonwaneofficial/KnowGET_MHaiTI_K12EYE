import type { Principal } from "@knowget/auth";
import { type IdempotencyRecord, IdempotencyService } from "@knowget/gateway";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GATEWAY_OPERATE, GATEWAY_READ, parseBody, tenantOf } from "./gateway-http";
import { purgeIdempotencyRecordsSchema } from "./gateway.dto";
import { GW_IDEMPOTENCY_SERVICE } from "./gateway.tokens";

/**
 * REST surface for the idempotency ledger (P3-D01) — the record of which guarded writes have already happened.
 *
 * The ledger is machinery, and this surface is what you can ask it rather than what you can do to it. `begin` and
 * `complete` have no routes: they are the two halves of a guarded write, taken by the request pipeline in the same
 * breath as the write itself, and exposing either would let a caller claim an operation was in flight or finished
 * without it ever having run — which is precisely the claim the ledger exists to make unfalsifiable. There is no
 * route that edits or deletes a single record for the same reason.
 *
 * So the reads are the substance, and they are scoped the way the questions are. There is no tenant-wide list,
 * deliberately, and the port carries none to expose: this table takes a row per guarded write, and materialising
 * all of them is not a report anybody reads. What an operator actually asks is what one integration has been
 * doing, or what happened to one key from an integrator's logs — both bounded, and both answerable here.
 *
 * The purge is housekeeping and nothing more. An expired record is already treated as absent by the ledger's own
 * inspection, so this can run late, run twice, or not run for a month without changing a single answer the ledger
 * gives; it reclaims space and reports a count. The instant is an argument for the reason the quarantine sweep's
 * is, and it sits under `gateway:operate` because a scheduled job holding it should not also be able to read one
 * integration's history — those are different questions asked by different accounts.
 */
@Controller("gateway/idempotency")
export class IdempotencyController {
  constructor(@Inject(GW_IDEMPOTENCY_SERVICE) private readonly service: IdempotencyService) {}

  /**
   * Drop records whose retention has run out, and say how many went.
   *
   * Not a creation, so 200 rather than 201, and the count is what the scheduled job that called this puts in its
   * log line — the only durable trace that the ledger is being kept to the size it was designed for.
   */
  @RequirePermissions(GATEWAY_OPERATE)
  @Post("purge")
  @HttpCode(200)
  async purgeExpired(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<{ count: number }> {
    const dto = parseBody(purgeIdempotencyRecordsSchema, body);
    const count = await this.service.purgeExpired(tenantOf(principal), dto.asOf as ISODateString);
    return { count };
  }

  /** Every guarded write one integration has made, in every state. The widest read this ledger offers. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-consumer/:consumerId")
  async listByConsumer(
    @CurrentPrincipal() principal: Principal,
    @Param("consumerId") consumerId: string,
  ): Promise<readonly IdempotencyRecord[]> {
    return this.service.listByConsumer(tenantOf(principal), consumerId as Uuid);
  }

  /**
   * One record by the key it was presented under, for one consumer. The read a duplicate investigation is: the
   * key comes out of the integrator's logs, and it is matched as the same string the write path preserved.
   */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-key/:consumerId/:idempotencyKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("consumerId") consumerId: string,
    @Param("idempotencyKey") idempotencyKey: string,
  ): Promise<IdempotencyRecord> {
    return this.service.getByKey(tenantOf(principal), consumerId as Uuid, idempotencyKey);
  }

  /** One record, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<IdempotencyRecord> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
