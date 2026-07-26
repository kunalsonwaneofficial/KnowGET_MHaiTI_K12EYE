import type { Principal } from "@knowget/auth";
import { type Room, RoomService } from "@knowget/residential";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { HOSTEL_READ, HOSTEL_WRITE, parseBody, tenantOf } from "./residential-http";
import { addBedSchema, createRoomSchema, setFloorSchema } from "./residential.dto";
import { RS_ROOM_SERVICE } from "./residential.tokens";

/** REST surface for rooms and their beds (P2-D17). Gated by hostel:*; tenant-scoped. */
@Controller("hostel/rooms")
export class RoomController {
  constructor(@Inject(RS_ROOM_SERVICE) private readonly service: RoomService) {}

  @RequirePermissions(HOSTEL_WRITE)
  @Post()
  @HttpCode(201)
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Room> {
    const dto = parseBody(createRoomSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      hostelId: dto.hostelId as Uuid,
      roomNumber: dto.roomNumber,
      type: dto.type,
      ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
      ...(dto.beds !== undefined ? { beds: dto.beds } : {}),
    });
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/floor")
  @HttpCode(200)
  async setFloor(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Room> {
    const dto = parseBody(setFloorSchema, body);
    return this.service.setFloor(tenantOf(principal), id as Uuid, dto.floor);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/beds")
  @HttpCode(200)
  async addBed(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Room> {
    const dto = parseBody(addBedSchema, body);
    return this.service.addBed(tenantOf(principal), id as Uuid, dto);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/beds/:key/remove")
  @HttpCode(200)
  async removeBed(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<Room> {
    return this.service.removeBed(tenantOf(principal), id as Uuid, key);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/make-available")
  @HttpCode(200)
  async makeAvailable(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Room> {
    return this.service.makeAvailable(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/send-to-maintenance")
  @HttpCode(200)
  async sendToMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Room> {
    return this.service.sendToMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/return-from-maintenance")
  @HttpCode(200)
  async returnFromMaintenance(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Room> {
    return this.service.returnFromMaintenance(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_WRITE)
  @Post(":id/decommission")
  @HttpCode(200)
  async decommission(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Room> {
    return this.service.decommission(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get("by-hostel/:hostelId")
  async listForHostel(
    @CurrentPrincipal() principal: Principal,
    @Param("hostelId") hostelId: string,
  ): Promise<Room[]> {
    return this.service.listForHostel(tenantOf(principal), hostelId as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Room[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(HOSTEL_READ)
  @Get(":id")
  async getById(@CurrentPrincipal() principal: Principal, @Param("id") id: string): Promise<Room> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
