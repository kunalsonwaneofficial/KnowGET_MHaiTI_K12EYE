import type { Principal } from "@knowget/auth";
import {
  type Dashboard,
  type DashboardPanel,
  DashboardService,
} from "@knowget/executive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  COMMAND_MANAGE,
  COMMAND_READ,
  parseBody,
  scopesOf,
  tenantOf,
} from "./executive-intelligence-http";
import {
  composeDashboardSchema,
  defineDashboardSchema,
  renameDashboardSchema,
  setDashboardPanelsSchema,
} from "./executive-intelligence.dto";
import { EI_DASHBOARD_SERVICE } from "./executive-intelligence.tokens";

/**
 * REST surface for dashboards (P2-D29) — what an institution decided to look at, and who is served which of it.
 *
 * This is the contract's first clause at the boundary, and the whole of it lives in one design decision:
 * composition removes withheld panels rather than blanking them. A reader whose scopes do not reach the finance
 * panel is not shown a locked tile — the page they get simply does not contain one. Blanking would disclose that
 * a figure exists and is being kept from them, which for most of what an institution measures is the interesting
 * half of the answer.
 *
 * Authoring sits under `command:manage` rather than under any viewing scope, and that placement is load-bearing.
 * The binding of a panel to a required scope *is* the role-awareness; someone who could rebind panels could
 * grant themselves any view by editing the page rather than by being given access to it.
 *
 * Panel scopes are drawn from the institution's own vocabulary and not from the five that gate these routes. A
 * panel may require `finance:read`; the domain compares it against whatever the principal holds without knowing
 * where either came from.
 *
 * Two reads compose, deliberately not one. {@link view} is the reader's path — by key, published only, against
 * their own scopes. {@link compose} is the author's — by id, at any status, against a scope set they choose,
 * which is the only way to find out what a principal holding some role would actually be served. Since
 * composition removes rather than blanks, a wrong binding is invisible from the inside, and being able to ask
 * that question before publication is the entire reason a dashboard is a draft first.
 */
@Controller("command/dashboards")
export class DashboardController {
  constructor(@Inject(EI_DASHBOARD_SERVICE) private readonly service: DashboardService) {}

  /** Author a dashboard. Starts as a draft, which is where its panel bindings can still be got wrong safely. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post()
  @HttpCode(201)
  async define(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Dashboard> {
    const dto = parseBody(defineDashboardSchema, body);
    return this.service.define({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      dashboardKey: dto.dashboardKey,
      name: dto.name,
      description: dto.description ?? null,
      panels: dto.panels,
    });
  }

  /**
   * Replace the panel set, whole. A panel's binding, subject and required scope are one statement about what a
   * page shows and to whom, so a per-panel route would let a page exist in a state where a binding and its scope
   * disagreed — and a page composed in that window would serve a figure to whoever happened to be asking.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/panels")
  @HttpCode(200)
  async setPanels(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Dashboard> {
    const dto = parseBody(setDashboardPanelsSchema, body);
    return this.service.setPanels(tenantOf(principal), id as Uuid, dto.panels);
  }

  /** Retitle or redescribe. The key is the dashboard's identity and is how readers reach it. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/rename")
  @HttpCode(200)
  async rename(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Dashboard> {
    const dto = parseBody(renameDashboardSchema, body);
    return this.service.rename(tenantOf(principal), id as Uuid, dto);
  }

  /** Serve the dashboard to readers. Until this happens {@link view} answers as though it did not exist. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Dashboard> {
    return this.service.publish(tenantOf(principal), id as Uuid);
  }

  /** Take the page out of service. Archived rather than removed, so a link to it still explains itself. */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Dashboard> {
    return this.service.archive(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(COMMAND_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly Dashboard[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The pages an organization currently serves. Unfiltered by scope, unlike briefings, and the asymmetry is
   * intentional: a dashboard whose every panel a reader is withheld composes to an empty page, which is a
   * coherent thing to be served, whereas a briefing filtered down to the findings somebody may see would be an
   * argument with its evidence removed.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("published/:organizationId")
  async listPublished(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly Dashboard[]> {
    return this.service.listPublished(tenantOf(principal), organizationId as Uuid);
  }

  /**
   * The reader's path: the panels of a published dashboard that this principal's own scopes reach.
   *
   * The granted set is taken from the authenticated principal and never from the request. A `grantedScopes`
   * parameter arriving on the wire would let any reader compose the page of any role, and the role-awareness
   * this contract asks for would be a display convention rather than a boundary.
   *
   * An unpublished dashboard answers as absent rather than as forbidden. That is not politeness: telling a
   * reader that a view exists but is not ready discloses that the institution is drafting a picture of itself,
   * and to whoever is asking that is usually the part worth knowing.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("view/:dashboardKey")
  async view(
    @CurrentPrincipal() principal: Principal,
    @Param("dashboardKey") dashboardKey: string,
  ): Promise<readonly DashboardPanel[]> {
    return this.service.view(tenantOf(principal), dashboardKey, scopesOf(principal));
  }

  /**
   * The author's path: the same composition, at any status, against the scopes the author is asking about.
   *
   * Gated by `command:manage` and not by the read scope, because arbitrary scopes are the whole point of it. An
   * author needs to ask what a principal holding `finance:read` would actually be served, and composition
   * removes rather than blanks, so a wrong binding cannot be seen from the inside. Allowing every reader to
   * compose against a scope set of their choosing would hand them the very leak the composition prevents.
   *
   * A `POST` that changes nothing, and the shape is the reason: the scope set is a list of institution-defined
   * strings, and a list in a path would have to be delimited by something no scope may contain. Inventing that
   * rule here would put a constraint on the institution's own vocabulary for the convenience of a URL.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Post(":id/compose")
  @HttpCode(200)
  async compose(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<readonly DashboardPanel[]> {
    const dto = parseBody(composeDashboardSchema, body);
    return this.service.compose(tenantOf(principal), id as Uuid, dto.grantedScopes);
  }

  /** The dashboard a tenant keeps under a key, whatever its status — the author's lookup, not the reader's. */
  @RequirePermissions(COMMAND_MANAGE)
  @Get("by-key/:dashboardKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("dashboardKey") dashboardKey: string,
  ): Promise<Dashboard> {
    return this.service.getByKey(tenantOf(principal), dashboardKey);
  }

  /**
   * The whole dashboard, panels and bindings included, without composition. Gated by `command:manage` because
   * the uncomposed panel set names every figure the page can show and the scope each one is kept behind — which
   * is exactly the map of an institution's withheld information that {@link view} exists to not hand out.
   */
  @RequirePermissions(COMMAND_MANAGE)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Dashboard> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
