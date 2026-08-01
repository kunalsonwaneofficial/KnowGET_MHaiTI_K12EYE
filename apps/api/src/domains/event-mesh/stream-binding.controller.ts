import type { Principal } from "@knowget/auth";
import { type StreamBinding, StreamBindingService } from "@knowget/event-mesh";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  MESH_DELIVER,
  MESH_READ,
  actorOf,
  parseBody,
  tenantOf,
  transportOf,
} from "./event-mesh-http";
import {
  declareStreamBindingSchema,
  retargetStreamBindingSchema,
  retireStreamBindingSchema,
} from "./event-mesh.dto";
import { EM_BINDING_SERVICE } from "./event-mesh.tokens";

/**
 * REST surface for stream bindings (P3-D02) — the backbone a stream is actually carried on.
 *
 * Bindings sit behind `mesh:deliver` rather than `mesh:govern`, and the split is the whole point of having two
 * scopes. Defining a stream says the platform records a kind of fact; binding it to a broker says that fact leaves
 * the building. Whoever decides attendance is worth recording is not automatically whoever decides attendance is
 * published to a message bus a third party also reads, and a platform that conflates the two has no way to let an
 * academic lead govern vocabulary without also handing them an egress path.
 *
 * `transportRef` is a reference and never credential material. What the aggregate accepts is a handle — a config
 * key, an environment name, a vault path, a secret-store entry — resolved by whatever holds the platform's
 * secrets, and the binding record learns only that it points somewhere. `retarget` exists so that pointing it
 * somewhere else is a first-class operation with an actor and a timestamp, rather than something done by editing
 * a row: repointing a live binding redirects every subsequent message on that stream, which is the single most
 * consequential edit available in this domain and the one most worth having a record of.
 *
 * `drain` before `retire` is the ordering the aggregate insists on and the reason this surface has four write
 * routes rather than two. A binding that stops carrying immediately abandons whatever was in flight on it; a
 * draining binding accepts nothing new and lets what it already holds finish, and `retire` then takes the count of
 * what never made it as an argument, so the number of abandoned messages is written down by whoever retired it
 * rather than inferred afterwards by somebody reconciling two systems that disagree.
 *
 * `by-stream/:streamKey/:transport` is an address rather than a filter. One binding per stream per transport is
 * the uniqueness the table holds, so a stream and a transport together name exactly one record — which is why the
 * transport is a path segment resolved against the package's own vocabulary, and why an unknown one is refused
 * here rather than passed through to become an empty read that reports a live binding as absent.
 */
@Controller("event-mesh/bindings")
export class StreamBindingController {
  constructor(@Inject(EM_BINDING_SERVICE) private readonly service: StreamBindingService) {}

  /**
   * Declare that a stream will be carried on a transport. It starts declared rather than active, so the record
   * exists — attributable, reviewable, pointing at a named reference — before anything begins flowing along it.
   */
  @RequirePermissions(MESH_DELIVER)
  @Post()
  @HttpCode(201)
  async declare(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<StreamBinding> {
    const dto = parseBody(declareStreamBindingSchema, body);
    return this.service.declare({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      streamKey: dto.streamKey,
      transport: dto.transport,
      transportRef: dto.transportRef,
    });
  }

  /**
   * Point the binding at a different broker. Its own route because retargeting a carrying binding redirects every
   * message published after it, and that is a change somebody should be named against rather than one that
   * arrives as a field in a general edit.
   */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/retarget")
  @HttpCode(200)
  async retarget(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StreamBinding> {
    const dto = parseBody(retargetStreamBindingSchema, body);
    return this.service.retarget(tenantOf(principal), id as Uuid, dto.transportRef);
  }

  /** Start carrying. The moment facts on this stream begin reaching the transport the binding names. */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StreamBinding> {
    return this.service.activate(tenantOf(principal), id as Uuid, actorOf(principal));
  }

  /** Accept nothing new, finish what is in flight. The step that makes retirement a plan rather than a cut. */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/drain")
  @HttpCode(200)
  async drain(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StreamBinding> {
    return this.service.drain(tenantOf(principal), id as Uuid);
  }

  /**
   * End the arrangement, stating how much never made it. The count is an argument rather than something the
   * platform infers, because whoever retires a binding knows what the queue looked like and nobody reading the
   * record a month later does.
   */
  @RequirePermissions(MESH_DELIVER)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<StreamBinding> {
    const dto = parseBody(retireStreamBindingSchema, body);
    return this.service.retire(tenantOf(principal), id as Uuid, dto.undeliveredMessages);
  }

  /** Every binding in the tenant, retired ones included. */
  @RequirePermissions(MESH_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly StreamBinding[]> {
    return this.service.list(tenantOf(principal));
  }

  /** What is leaving this institution right now, and on what. The read an egress review is actually about. */
  @RequirePermissions(MESH_READ)
  @Get("carrying/:organizationId")
  async listCarrying(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly StreamBinding[]> {
    return this.service.listCarrying(tenantOf(principal), organizationId as Uuid);
  }

  /** The one binding a stream has on a named transport, which is the uniqueness this table holds. */
  @RequirePermissions(MESH_READ)
  @Get("by-stream/:streamKey/:transport")
  async getByStreamAndTransport(
    @CurrentPrincipal() principal: Principal,
    @Param("streamKey") streamKey: string,
    @Param("transport") transport: string,
  ): Promise<StreamBinding> {
    return this.service.getByStreamAndTransport(
      tenantOf(principal),
      streamKey,
      transportOf(transport),
    );
  }

  /** Every backbone one stream is carried on — how far a fact published to it actually travels. */
  @RequirePermissions(MESH_READ)
  @Get("by-stream/:streamKey")
  async listByStream(
    @CurrentPrincipal() principal: Principal,
    @Param("streamKey") streamKey: string,
  ): Promise<readonly StreamBinding[]> {
    return this.service.listByStream(tenantOf(principal), streamKey);
  }

  /** One binding, or a 404. */
  @RequirePermissions(MESH_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<StreamBinding> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
