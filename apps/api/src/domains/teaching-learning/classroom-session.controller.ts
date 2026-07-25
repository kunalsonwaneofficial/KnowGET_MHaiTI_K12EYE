import type { Principal } from "@knowget/auth";
import {
  type ClassroomSession,
  ClassroomSessionService,
  type SessionDelivery,
} from "@knowget/teaching-learning";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  createClassroomSessionSchema,
  deliverySchema,
  reflectionsSchema,
  stringListSchema,
} from "./teaching-learning.dto";
import { parseBody, TEACHING_READ, TEACHING_WRITE, tenantOf } from "./teaching-learning-http";
import { TL_CLASSROOM_SESSION_SERVICE } from "./teaching-learning.tokens";

type DeliveryDto = ReturnType<typeof deliverySchema.parse>;

const toDelivery = (dto: DeliveryDto): SessionDelivery => ({
  ...(dto.actualTopicsCovered !== undefined
    ? { actualTopicsCovered: dto.actualTopicsCovered }
    : {}),
  ...(dto.activitiesCompleted !== undefined
    ? { activitiesCompleted: dto.activitiesCompleted }
    : {}),
  ...(dto.resourcesUsedIds !== undefined
    ? { resourcesUsedIds: dto.resourcesUsedIds as Uuid[] }
    : {}),
  ...(dto.participation !== undefined ? { participation: dto.participation } : {}),
});

/** REST surface for classroom sessions (P2-D09). Gated by teaching:*; tenant-scoped. */
@Controller("teaching-learning/classroom-sessions")
export class ClassroomSessionController {
  constructor(
    @Inject(TL_CLASSROOM_SESSION_SERVICE) private readonly service: ClassroomSessionService,
  ) {}

  @RequirePermissions(TEACHING_WRITE)
  @Post()
  @HttpCode(201)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ClassroomSession> {
    const dto = parseBody(createClassroomSessionSchema, body);
    return this.service.create({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      title: dto.title,
      date: dto.date,
      ...(dto.scheduleSlotId !== undefined ? { scheduleSlotId: dto.scheduleSlotId as Uuid } : {}),
      ...(dto.lessonPlanId !== undefined ? { lessonPlanId: dto.lessonPlanId as Uuid } : {}),
      ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId as Uuid } : {}),
      ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId as Uuid } : {}),
      ...(dto.plannedTopics !== undefined ? { plannedTopics: dto.plannedTopics } : {}),
    });
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<ClassroomSession[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-section/:sectionId")
  async listForSection(
    @CurrentPrincipal() principal: Principal,
    @Param("sectionId") sectionId: string,
  ): Promise<ClassroomSession[]> {
    return this.service.listForSection(tenantOf(principal), sectionId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get("by-subject/:subjectId")
  async listForSubject(
    @CurrentPrincipal() principal: Principal,
    @Param("subjectId") subjectId: string,
  ): Promise<ClassroomSession[]> {
    return this.service.listForSubject(tenantOf(principal), subjectId as Uuid);
  }

  @RequirePermissions(TEACHING_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ClassroomSession> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/planned-topics")
  @HttpCode(200)
  async setPlannedTopics(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClassroomSession> {
    const dto = parseBody(stringListSchema, body);
    return this.service.setPlannedTopics(tenantOf(principal), id as Uuid, dto.items);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/deliver")
  @HttpCode(200)
  async deliver(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClassroomSession> {
    const dto = parseBody(deliverySchema, body);
    return this.service.deliver(tenantOf(principal), id as Uuid, toDelivery(dto));
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/amend-delivery")
  @HttpCode(200)
  async amendDelivery(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClassroomSession> {
    const dto = parseBody(deliverySchema, body);
    return this.service.amendDelivery(tenantOf(principal), id as Uuid, toDelivery(dto));
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/reflections")
  @HttpCode(200)
  async recordReflections(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ClassroomSession> {
    const dto = parseBody(reflectionsSchema, body);
    return this.service.recordReflections(tenantOf(principal), id as Uuid, dto.reflections);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/complete")
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ClassroomSession> {
    return this.service.complete(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(TEACHING_WRITE)
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ClassroomSession> {
    return this.service.cancel(tenantOf(principal), id as Uuid);
  }
}
