import type { Principal } from "@knowget/auth";
import {
  type CapabilityRoute,
  CapabilityRouteService,
  type RouteCandidate,
  toPublicRouteView,
} from "@knowget/gateway";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { GATEWAY_PUBLISH, GATEWAY_READ, parseBody, tenantOf } from "./gateway-http";
import {
  registerCapabilityRouteSchema,
  retargetCapabilityRouteSchema,
  reviseCapabilityRouteSchema,
} from "./gateway.dto";
import { GW_ROUTE_SERVICE } from "./gateway.tokens";

/**
 * Project a route the way the outside world is allowed to see it, plus the id an administrator needs to act on it.
 *
 * `RouteCandidate` is the package's own pairing and it is the only shape this controller returns. The view carries
 * the public address, method, contract version, status, required scope, style and whether the route is guarded —
 * everything a caller needs in order to call it, and nothing about where the call lands.
 */
const candidate = (route: CapabilityRoute): RouteCandidate => ({
  routeId: route.id,
  view: toPublicRouteView(route),
});

/**
 * REST surface for capability routes (P3-D01) — the public addresses under a contract.
 *
 * This is the one controller in the domain that never returns its aggregate. Every read *and* every mutation
 * answers with a projected route, because `internalTarget` is the field the whole contract turns on: it names
 * where inside the platform a public address currently resolves, and the moment it crosses the boundary an
 * integrator can acquire a dependency on it. Making the projection uniform across reads and writes is the point —
 * a retarget that echoed back the target it had just set would leak exactly the fact the reads are careful not to,
 * and to whoever cared most about it. So the target is written over HTTP and never read back over it, and the
 * domain behind a route can be split, renamed or moved without one external caller learning that it happened.
 *
 * The address is the method and the path together, which is what an integrator wrote down, so revision reaches the
 * path but not the method — changing one of the two in place would move the address while looking like an edit.
 * Retargeting is separate again, and it is where the indirection pays for itself: nothing visible changes, which
 * makes it the safe operation for refactoring and the dangerous one for a caller's existing integration, which is
 * why it sits under `gateway:publish` beside publication rather than under an operational scope.
 *
 * Registration is refused unless the contract is live, the required scope exists in the platform's permission
 * vocabulary, and the internal target names something the capability catalogue actually knows how to invoke. All
 * three are checked by the service against directories owned elsewhere, so a route that points at nothing fails at
 * registration rather than on a caller's first request.
 */
@Controller("gateway/routes")
export class CapabilityRouteController {
  constructor(@Inject(GW_ROUTE_SERVICE) private readonly service: CapabilityRouteService) {}

  /**
   * Give a capability a public address under a contract. The capability, version, style and organization are read
   * from the contract rather than restated, so a route cannot claim to serve a version it is not attached to.
   */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post()
  @HttpCode(201)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<RouteCandidate> {
    const dto = parseBody(registerCapabilityRouteSchema, body);
    return candidate(
      await this.service.register({
        tenantId: tenantOf(principal),
        contractId: dto.contractId as Uuid,
        method: dto.method,
        externalPath: dto.externalPath,
        requiredScope: dto.requiredScope,
        internalTarget: dto.internalTarget,
        idempotencyGuarded: dto.idempotencyGuarded,
      }),
    );
  }

  /** Move the path, change the scope it demands, or change whether it is guarded. The method stays where it is. */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<RouteCandidate> {
    const dto = parseBody(reviseCapabilityRouteSchema, body);
    return candidate(
      await this.service.revise(tenantOf(principal), id as Uuid, {
        externalPath: dto.externalPath,
        requiredScope: dto.requiredScope,
        idempotencyGuarded: dto.idempotencyGuarded,
      }),
    );
  }

  /** Point a live address at a different capability inside the platform. Nothing an integrator can see moves. */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/retarget")
  @HttpCode(200)
  async retarget(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<RouteCandidate> {
    const dto = parseBody(retargetCapabilityRouteSchema, body);
    return candidate(
      await this.service.retarget(tenantOf(principal), id as Uuid, dto.internalTarget),
    );
  }

  /** Start answering. Admissible only under a contract that is itself published and not past its sunset. */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RouteCandidate> {
    return candidate(await this.service.activate(tenantOf(principal), id as Uuid));
  }

  /**
   * Stop answering. The record stays and the address is freed, because a retired route is how a caller still
   * pointing at yesterday's path gets an explanation rather than a silence.
   */
  @RequirePermissions(GATEWAY_PUBLISH)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RouteCandidate> {
    return candidate(await this.service.retire(tenantOf(principal), id as Uuid));
  }

  /** Every route in the tenant, drafts and retired ones included. */
  @RequirePermissions(GATEWAY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly RouteCandidate[]> {
    return (await this.service.list(tenantOf(principal))).map(candidate);
  }

  /** The organization's live surface — what an integrator can reach at this moment, by address. */
  @RequirePermissions(GATEWAY_READ)
  @Get("active/:organizationId")
  async listActive(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly RouteCandidate[]> {
    const routes = await this.service.listActive(tenantOf(principal), organizationId as Uuid);
    return routes.map(candidate);
  }

  /** Everything one contract exposes. The read a version's surface review is. */
  @RequirePermissions(GATEWAY_READ)
  @Get("by-contract/:contractId")
  async listByContract(
    @CurrentPrincipal() principal: Principal,
    @Param("contractId") contractId: string,
  ): Promise<readonly RouteCandidate[]> {
    const routes = await this.service.listByContract(tenantOf(principal), contractId as Uuid);
    return routes.map(candidate);
  }

  /** One route, or a 404. */
  @RequirePermissions(GATEWAY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<RouteCandidate> {
    return candidate(await this.service.get(tenantOf(principal), id as Uuid));
  }
}
