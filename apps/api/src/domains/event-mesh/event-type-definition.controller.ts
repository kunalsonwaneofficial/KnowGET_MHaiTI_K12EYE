import type { Principal } from "@knowget/auth";
import {
  type EventTypeDefinition,
  EventTypeDefinitionService,
  type PublicationVerdict,
} from "@knowget/event-mesh";
import type { ISODateString, Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { MESH_GOVERN, MESH_READ, actorOf, parseBody, tenantOf, versionOf } from "./event-mesh-http";
import {
  assessPublicationQuerySchema,
  defineEventTypeSchema,
  deprecateEventTypeSchema,
  reviseEventTypeSchema,
} from "./event-mesh.dto";
import { EM_EVENT_TYPE_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for event type definitions (P3-D02) — the vocabulary of facts the platform is willing to carry.
 *
 * Every write is `mesh:govern`, because this is where an institution decides what it is prepared to say about
 * itself and what other capabilities are then entitled to rely on. A published event type is a promise: some
 * consumer elsewhere in the platform will be written against this shape and will keep working only for as long
 * as the shape does. That is a governance decision rather than an operational one, which is why nothing on this
 * surface is reachable from the on-call keys that run the mesh day to day.
 *
 * The lifecycle is four transitions rather than an edit and a delete, and each of them exists because the state
 * it produces answers a question the others cannot. A draft may be restated freely, because nothing has been
 * promised yet. Publishing is the moment the promise is made and the point after which the definition stops
 * being editable — `revise` refuses a published version, so a successor is a new version rather than a quiet
 * rewrite of the one consumers already read. Deprecation is a dated announcement with a named successor, and
 * retirement is the end of the promise; both survive, because a consumer that breaks six months later is
 * investigated by reading what the platform said it would carry and when it stopped.
 *
 * `:id/publication` is the read that makes publishing reviewable rather than a leap. It reports whether this
 * version is a safe successor to the highest published one under its key — which fields were added, removed or
 * retyped, and whether that is compatible under the mode the definition declared. It takes the instant as an
 * argument rather than reading a clock, so the same question asked twice about the same version gets the same
 * answer, and *would this have been publishable when we shipped it* remains askable after an incident.
 *
 * `by-key/:eventTypeKey` returns every version under a key and `by-key/:eventTypeKey/:version` returns one.
 * Both matter: a consumer resolving a message it has just received wants one version, and somebody deciding
 * whether a change is safe wants the whole history of what that key has meant.
 */
@Controller("event-mesh/event-types")
export class EventTypeDefinitionController {
  constructor(
    @Inject(EM_EVENT_TYPE_SERVICE) private readonly service: EventTypeDefinitionService,
  ) {}

  /**
   * Declare a kind of fact. Starts as a draft, so a schema exists and can be argued about before any consumer
   * is entitled to depend on it — and the version, when stated, must be the next one after the highest already
   * published under the key rather than any number the caller prefers.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post()
  @HttpCode(201)
  async define(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<EventTypeDefinition> {
    const dto = parseBody(defineEventTypeSchema, body);
    return this.service.define({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      eventTypeKey: dto.eventTypeKey,
      version: dto.version,
      title: dto.title,
      summary: dto.summary,
      compatibilityMode: dto.compatibilityMode,
      schemaFields: dto.schemaFields,
    });
  }

  /**
   * Restate a draft, field list included. Only a draft: once a version is published the aggregate refuses this,
   * because a shape consumers are already reading must change by becoming a new version rather than by being
   * edited underneath them.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventTypeDefinition> {
    const dto = parseBody(reviseEventTypeSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, {
      title: dto.title,
      summary: dto.summary,
      compatibilityMode: dto.compatibilityMode,
      schemaFields: dto.schemaFields,
    });
  }

  /**
   * Make the promise. Attributed, because publishing is the decision other capabilities will build against, and
   * the name is the first thing anybody asks for when a version turns out to have promised the wrong thing.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventTypeDefinition> {
    return this.service.publish(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /**
   * Announce that this version is going away, with a date and a successor. Both instants come from the caller
   * rather than a clock, because the notice between them is the whole substance of the announcement and a
   * server-stamped one would be unreviewable afterwards.
   */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/deprecate")
  @HttpCode(200)
  async deprecate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<EventTypeDefinition> {
    const dto = parseBody(deprecateEventTypeSchema, body);
    return this.service.deprecate(
      tenantOf(principal),
      id as Uuid,
      dto.announcedAt as ISODateString,
      dto.retireAt as ISODateString,
      dto.supersededByVersion,
    );
  }

  /** End the promise. The definition stays, because what the platform used to carry is a durable question. */
  @RequirePermissions(MESH_GOVERN)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventTypeDefinition> {
    return this.service.retire(tenantOf(principal), id as Uuid);
  }

  /** Every definition in the tenant, retired ones included. The registry, read whole. */
  @RequirePermissions(MESH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly EventTypeDefinition[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What one organization says about itself — the vocabulary a school owns rather than the tenant's whole set. */
  @RequirePermissions(MESH_READ)
  @Get("carried/:organizationId")
  async listCarried(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly EventTypeDefinition[]> {
    return this.service.listCarried(tenantOf(principal), organizationId as Uuid);
  }

  /** One exact version, which is what a consumer resolving a message it has just received actually needs. */
  @RequirePermissions(MESH_READ)
  @Get("by-key/:eventTypeKey/:version")
  async getByKeyAndVersion(
    @CurrentPrincipal() principal: Principal,
    @Param("eventTypeKey") eventTypeKey: string,
    @Param("version") version: string,
  ): Promise<EventTypeDefinition> {
    return this.service.getByKeyAndVersion(tenantOf(principal), eventTypeKey, versionOf(version));
  }

  /** Every version under one key, which is what deciding whether a change is safe actually needs. */
  @RequirePermissions(MESH_READ)
  @Get("by-key/:eventTypeKey")
  async listByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("eventTypeKey") eventTypeKey: string,
  ): Promise<readonly EventTypeDefinition[]> {
    return this.service.listByKey(tenantOf(principal), eventTypeKey);
  }

  /** Whether this version is a safe successor as of a stated instant, and what changed if it is not. */
  @RequirePermissions(MESH_READ)
  @Get(":id/publication")
  async assessPublication(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Query() query: unknown,
  ): Promise<PublicationVerdict> {
    const dto = parseBody(assessPublicationQuerySchema, query);
    return this.service.assessPublication(
      tenantOf(principal),
      id as Uuid,
      dto.asOf as ISODateString,
    );
  }

  /** One definition, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<EventTypeDefinition> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
