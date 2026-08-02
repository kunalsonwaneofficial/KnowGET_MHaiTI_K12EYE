import type { Principal } from "@knowget/auth";
import {
  type EventStream,
  EventStreamService,
  type PartitionDeclaration,
} from "@knowget/event-mesh";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { MESH_GOVERN, MESH_READ, actorOf, parseBody, tenantOf } from "./event-mesh-http";
import {
  changeStreamEventTypeSchema,
  defineEventStreamSchema,
  repartitionEventStreamSchema,
  reviseStreamRetentionSchema,
} from "./event-mesh.dto";
import { EM_STREAM_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for event streams (P3-D02) — the named channels an institution's facts travel along.
 *
 * A stream is three decisions held together: which event types it will accept, how its ordering is guaranteed, and
 * how long a body is kept. All three sit behind `mesh:govern` because all three are answerable rather than
 * operational. Retention especially: how long a record of what happened to a learner is kept is a question an
 * institution answers to a regulator and a parent, not a dial an on-call rota turns at three in the morning
 * because a table got large. Operations may run the sweep — that is `mesh:operate` on the message surface — but
 * what the sweep is entitled to forget is decided here.
 *
 * `accept` and `withdraw` are the stream's half of the vocabulary agreement, and they are separate routes rather
 * than one edit of a list. Replacing a set is an operation whose diff nobody reads; naming the type being admitted
 * or removed makes each change a decision with a subject. Withdrawing is the one that matters — it is the moment a
 * stream stops carrying a kind of fact, and consumers subscribed to that stream will simply stop seeing it.
 *
 * `repartition` and `activate` are held apart from each other for a reason the aggregate enforces and this surface
 * only reflects: partitioning determines which messages are ordered relative to which, and changing it once a
 * stream is carrying traffic re-shuffles that relationship for everything published afterwards. Consumers that
 * were reading one ordering find themselves reading another, with no event to tell them so. A draft stream can be
 * partitioned freely; a live one cannot, and the route exists so the refusal is explicit rather than implied.
 *
 * `:id/partitioning` is the declaration a producer needs before it can compute where anything lands — the count,
 * the ordering guarantee and the key path in one read, so a publisher does not have to reconstruct them from a
 * stream record it would otherwise have to know how to interpret.
 */
@Controller("event-mesh/streams")
export class EventStreamController {
  constructor(@Inject(EM_STREAM_SERVICE) private readonly service: EventStreamService) {}

  /**
   * Define a stream. Ordering, partition count, key path and retention all default, because a stream that is
   * merely a place to put facts should not require six decisions before it exists — and every default the package
   * chose is the conservative one: partition ordering, a digest rather than a body, thirty days.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post()
  @HttpCode(201)
  async define(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EventStream> {
    const dto = parseBody(defineEventStreamSchema, body);
    return this.service.define({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      streamKey: dto.streamKey,
      title: dto.title,
      summary: dto.summary,
      ordering: dto.ordering,
      partitionCount: dto.partitionCount,
      partitionKeyPath: dto.partitionKeyPath,
      retention: dto.retention,
      retentionSeconds: dto.retentionSeconds,
      eventTypeKeys: dto.eventTypeKeys,
    });
  }

  /**
   * Change how the stream is divided and ordered. Refused once the stream is live, because the partition a
   * message lands in is a function of the count, and changing the count silently re-orders everything published
   * after it against everything published before.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/repartition")
  @HttpCode(200)
  async repartition(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventStream> {
    const dto = parseBody(repartitionEventStreamSchema, body);
    return this.service.repartition(tenantOf(principal), id as Uuid, {
      ordering: dto.ordering,
      partitionCount: dto.partitionCount,
      partitionKeyPath: dto.partitionKeyPath,
    });
  }

  /**
   * Change what is kept and for how long. Both together, deliberately: a window without a mode is meaningless on
   * a stream that never held a body, and a mode without a window says nothing about when the promise expires.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/revise-retention")
  @HttpCode(200)
  async reviseRetention(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventStream> {
    const dto = parseBody(reviseStreamRetentionSchema, body);
    return this.service.reviseRetention(
      tenantOf(principal),
      id as Uuid,
      dto.retention,
      dto.retentionSeconds,
    );
  }

  /** Admit one event type to the stream. Named one at a time so that admitting a kind of fact is a decision. */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/accept")
  @HttpCode(200)
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventStream> {
    const dto = parseBody(changeStreamEventTypeSchema, body);
    return this.service.accept(tenantOf(principal), id as Uuid, dto.eventTypeKey);
  }

  /**
   * Stop carrying one event type. The consequential half of the pair: subscribers to this stream do not receive
   * an event telling them a kind of fact has stopped arriving, they simply stop seeing it.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventStream> {
    const dto = parseBody(changeStreamEventTypeSchema, body);
    return this.service.withdraw(tenantOf(principal), id as Uuid, dto.eventTypeKey);
  }

  /** Open the stream for traffic. Attributed, because this is the moment the partitioning stops being editable. */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventStream> {
    return this.service.activate(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Stop accepting publications, reversibly. What an institution reaches for when a producer misbehaves. */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/pause")
  @HttpCode(200)
  async pause(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventStream> {
    return this.service.pause(tenantOf(principal), id as Uuid);
  }

  /** End the stream. The record stays, and so do the messages it already carried. */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventStream> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  /** Every stream in the tenant, retired ones included. */
  @RequirePermissions(MESH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly EventStream[]> {
    return this.service.list(tenantOf(principal));
  }

  /** Which of this institution's streams will actually accept a publication right now. */
  @RequirePermissions(MESH_READ)
  @Get("publishable/:organizationId")
  async listPublishable(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly EventStream[]> {
    return this.service.listPublishable(tenantOf(principal), organizationId as Uuid);
  }

  /** Where a given kind of fact goes — the read a producer performs once and a reviewer performs often. */
  @RequirePermissions(MESH_READ)
  @Get("accepting/:eventTypeKey")
  async listAcceptingEventType(
    @CurrentPrincipal() principal: Principal,
    @Param("eventTypeKey") eventTypeKey: string,
  ): Promise<readonly EventStream[]> {
    return this.service.listAcceptingEventType(tenantOf(principal), eventTypeKey);
  }

  /** One stream by the key producers and subscriptions name it with. */
  @RequirePermissions(MESH_READ)
  @Get("by-key/:streamKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("streamKey") streamKey: string,
  ): Promise<EventStream> {
    return this.service.getByKey(tenantOf(principal), streamKey);
  }

  /** The count, the guarantee and the key path in one read — what a publisher needs to place a message. */
  @RequirePermissions(MESH_READ)
  @Get(":id/partitioning")
  async partitioning(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<PartitionDeclaration> {
    return this.service.partitioning(tenantOf(principal), id as Uuid);
  }

  /** One stream, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventStream> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
