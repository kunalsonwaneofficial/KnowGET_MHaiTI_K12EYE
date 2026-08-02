import type { Principal } from "@knowget/auth";
import { type MeshMessage, MeshMessageService, completeEnvelope } from "@knowget/event-mesh";
import { nowIso, toCorrelationId } from "@knowget/shared";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  MESH_OPERATE,
  MESH_PUBLISH,
  MESH_READ,
  MESH_REPLAY,
  parseBody,
  partitionOf,
  tenantOf,
} from "./event-mesh-http";
import {
  messageWindowQuerySchema,
  recordMeshMessageSchema,
  sweepRetentionSchema,
} from "./event-mesh.dto";
import { EM_MESSAGE_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for mesh messages (P3-D02) — the facts themselves, and the four different rights to touch them.
 *
 * This is the only controller in the domain gated by four scopes, and the split is not fussiness. Recording is
 * `mesh:publish`, which every producing capability in the platform holds and which therefore must not carry the
 * power to do anything else. Forgetting a body and sweeping a stream are `mesh:operate`, because they are the
 * platform honouring a retention promise governance already made. Headers, counts and windows are `mesh:read`.
 * Reading a stored body is `mesh:replay`, alone.
 *
 * That last line is the one worth defending. Every read on this surface except one returns an envelope — who
 * published what kind of fact, about which aggregate, when, on which stream and in which partition. The payload
 * is the fact itself, and on a `full`-retention stream in a school that means the substance of an assessment, a
 * safeguarding note or a fee dispute, available in bulk for as long as retention lasts. Knowing that an enrolment
 * was confirmed and being handed what was written about the learner are different permissions in every other
 * domain of this platform; the mesh is the one place where treating them as the same would quietly hand a broad
 * operational key the contents of every domain at once. So `:id/payload` sits with replay, which is the scope of
 * the two people who have an honest reason to open a stored body: whoever is deciding whether a window is worth
 * re-delivering, and whoever is working out why a consumer choked on it.
 *
 * `record` is the one route in this domain that constructs a domain object rather than forwarding fields. The
 * envelope is completed by the package's own engine from what the producer stated and what this boundary knows,
 * so that a message published through HTTP is completed by exactly the same code as one published in process —
 * two implementations of envelope completion would be two opinions about what a valid message is, and the one
 * that mattered would be whichever the failing publisher happened to use. `recordedAt` defaults to now here
 * because the mesh takes custody at the boundary, and a caller may state it so a relay replaying an outbox
 * records when the mesh actually accepted the fact rather than when the retry got round to it.
 *
 * `sweep` and `forget` are the same act at two scales and both are `mesh:operate`. Neither decides what may be
 * forgotten — the stream's retention decided that, under `mesh:govern` — and both leave the envelope in place. A
 * swept message is still a record that a fact crossed the mesh; it is only the body that goes.
 */
@Controller("event-mesh/messages")
export class MeshMessageController {
  constructor(@Inject(EM_MESSAGE_SERVICE) private readonly service: MeshMessageService) {}

  /**
   * Record a fact on a stream. The envelope is completed by the package's engine rather than assembled here, so
   * the same rules refuse the same incomplete publication whichever door it arrived through, and the payload is
   * kept or reduced to its digest according to what the stream's retention already promised.
   */
  @RequirePermissions(MESH_PUBLISH)
  @Post()
  @HttpCode(201)
  async record(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<MeshMessage> {
    const dto = parseBody(recordMeshMessageSchema, body);
    const envelope = completeEnvelope(
      {
        type: dto.eventTypeKey,
        payload: dto.payload,
        metadata: {
          eventId: dto.eventId as Uuid,
          occurredAt: dto.occurredAt as ISODateString,
          tenantId: tenantOf(principal),
          correlationId: toCorrelationId(dto.correlationId),
          causationId: (dto.causationId as Uuid | null) ?? undefined,
          version: dto.eventTypeVersion,
        },
      },
      {
        streamKey: dto.streamKey,
        producerKey: dto.producerKey,
        traceId: dto.traceId,
        aggregate: { aggregateType: dto.aggregateType, aggregateId: dto.aggregateId as Uuid },
        recordedAt: (dto.recordedAt as ISODateString | undefined) ?? nowIso(),
        partitionKey: dto.partitionKey,
      },
    );
    return this.service.record({
      envelope,
      payloadDigest: dto.payloadDigest,
      payload: dto.payload,
    });
  }

  /**
   * Forget one body, keeping its envelope. What an erasure request reaches for: the record that a fact crossed
   * the mesh survives, because deleting it would leave a gap in a gapless sequence that every consumer reading
   * across it would report as a message it lost.
   */
  @RequirePermissions(MESH_OPERATE)
  @Post(":id/forget")
  @HttpCode(200)
  async forget(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MeshMessage> {
    return this.service.forget(tenantOf(principal), id as Uuid);
  }

  /**
   * Forget everything on one stream that is older than its retention promise, as of a stated instant. The stream
   * is in the body rather than the path because this is a write against a set rather than a read of a record,
   * and the instant is an argument rather than a clock so that a sweep is exactly reproducible.
   */
  @RequirePermissions(MESH_OPERATE)
  @Post("sweep")
  @HttpCode(200)
  async sweepRetention(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<readonly MeshMessage[]> {
    const dto = parseBody(sweepRetentionSchema, body);
    return this.service.sweepRetention(
      tenantOf(principal),
      dto.streamKey,
      dto.asOf as ISODateString,
    );
  }

  /**
   * The envelopes recorded on a stream between two instants, in sequence order. Bounded by when the mesh took
   * custody rather than when the fact occurred, matching retention — a window bounded by occurrence would ask
   * for messages that were never retained inside it.
   */
  @RequirePermissions(MESH_READ)
  @Get("window")
  async listWindow(
    @CurrentPrincipal() principal: Principal,
    @Query() query: unknown,
  ): Promise<readonly MeshMessage[]> {
    const dto = parseBody(messageWindowQuerySchema, query);
    return this.service.listWindow(
      tenantOf(principal),
      dto.streamKey,
      dto.fromInstant as ISODateString,
      dto.toInstant as ISODateString,
    );
  }

  /**
   * How many messages a window holds, counted by the store. The read that answers whether a replay is worth
   * requesting before anybody requests one — and the same number the replay ceiling is enforced against.
   */
  @RequirePermissions(MESH_READ)
  @Get("count")
  async countWindow(
    @CurrentPrincipal() principal: Principal,
    @Query() query: unknown,
  ): Promise<number> {
    const dto = parseBody(messageWindowQuerySchema, query);
    return this.service.countWindow(
      tenantOf(principal),
      dto.streamKey,
      dto.fromInstant as ISODateString,
      dto.toInstant as ISODateString,
    );
  }

  /**
   * The highest sequence on one partition. Per-partition rather than per-stream because a subscription reading
   * eight partitions can be current on seven and stopped on the eighth, and a single stream head averages the
   * dead one away into a number that looks healthy.
   */
  @RequirePermissions(MESH_READ)
  @Get("head/:streamKey/:partition")
  async head(
    @CurrentPrincipal() principal: Principal,
    @Param("streamKey") streamKey: string,
    @Param("partition") partition: string,
  ): Promise<number> {
    return this.service.head(tenantOf(principal), streamKey, partitionOf(partition));
  }

  /** One message by the event id its producer minted — how a publisher checks whether its retry already landed. */
  @RequirePermissions(MESH_READ)
  @Get("by-event/:eventId")
  async getByEventId(
    @CurrentPrincipal() principal: Principal,
    @Param("eventId") eventId: string,
  ): Promise<MeshMessage> {
    return this.service.getByEventId(tenantOf(principal), eventId as Uuid);
  }

  /**
   * The stored body, if the stream retained one and the sweep has not reached it. Behind `mesh:replay` rather
   * than `mesh:read`, because this is the one read in the domain that returns institutional content rather than
   * an account of it, and it returns that content for every domain the mesh carries.
   */
  @RequirePermissions(MESH_REPLAY)
  @Get(":id/payload")
  async payload(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.payload(tenantOf(principal), id as Uuid);
  }

  /** One message envelope, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<MeshMessage> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
