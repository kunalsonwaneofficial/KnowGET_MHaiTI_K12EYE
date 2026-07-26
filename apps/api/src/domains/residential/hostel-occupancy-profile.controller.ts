import type { Principal } from "@knowget/auth";
import {
  type HostelOccupancyProfile,
  HostelOccupancyProfileService,
  type ResidenceOccupancySummary,
} from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { BOARDING_READ, BOARDING_WRITE, parseBody, tenantOf } from "./residential-http";
import { refreshOccupancySchema } from "./residential.dto";
import { RS_OCCUPANCY_SERVICE } from "./residential.tokens";

/** REST surface for hostel occupancy profiles (P2-D17). Gated by boarding:*; tenant-scoped. */
@Controller("boarding/occupancy")
export class HostelOccupancyProfileController {
  constructor(
    @Inject(RS_OCCUPANCY_SERVICE) private readonly service: HostelOccupancyProfileService,
  ) {}

  @RequirePermissions(BOARDING_WRITE)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<HostelOccupancyProfile> {
    const dto = parseBody(refreshOccupancySchema, body);
    return this.service.refresh(tenantOf(principal), dto.hostelId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get("summary")
  async summarize(@CurrentPrincipal() principal: Principal): Promise<ResidenceOccupancySummary> {
    return this.service.summarize(tenantOf(principal));
  }

  @RequirePermissions(BOARDING_READ)
  @Get("by-hostel/:hostelId")
  async getForHostel(
    @CurrentPrincipal() principal: Principal,
    @Param("hostelId") hostelId: string,
  ): Promise<HostelOccupancyProfile | null> {
    return this.service.getForHostel(tenantOf(principal), hostelId as Uuid);
  }

  @RequirePermissions(BOARDING_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<HostelOccupancyProfile[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(BOARDING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<HostelOccupancyProfile> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
