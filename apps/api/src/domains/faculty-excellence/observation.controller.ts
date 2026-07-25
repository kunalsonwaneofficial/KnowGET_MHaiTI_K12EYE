import type { Principal } from "@knowget/auth";
import {
  type CompetencyRatingInput,
  type ConductObservationParams,
  type Observation,
  ObservationService,
} from "@knowget/faculty-excellence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import { conductObservationSchema, scheduleObservationSchema } from "./faculty-excellence.dto";
import { FACULTY_READ, FACULTY_WRITE, parseBody, tenantOf } from "./faculty-excellence-http";
import { FE_OBSERVATION_SERVICE } from "./faculty-excellence.tokens";

/** Build ConductObservationParams from a parsed body, including only defined optional fields. */
function toConductParams(dto: {
  ratings: readonly { competencyKey: string; rating: number; comment?: string | null }[];
  strengths?: string | null;
  growthAreas?: string | null;
}): ConductObservationParams {
  const ratings: CompetencyRatingInput[] = dto.ratings.map((r) => ({
    competencyKey: r.competencyKey,
    rating: r.rating,
    ...(r.comment !== undefined ? { comment: r.comment } : {}),
  }));
  return {
    ratings,
    ...(dto.strengths !== undefined ? { strengths: dto.strengths } : {}),
    ...(dto.growthAreas !== undefined ? { growthAreas: dto.growthAreas } : {}),
  };
}

/** REST surface for observations (P2-D13). Gated by faculty:*; tenant-scoped. */
@Controller("faculty/observations")
export class ObservationController {
  constructor(@Inject(FE_OBSERVATION_SERVICE) private readonly service: ObservationService) {}

  @RequirePermissions(FACULTY_WRITE)
  @Post()
  @HttpCode(201)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Observation> {
    const dto = parseBody(scheduleObservationSchema, body);
    return this.service.schedule({
      tenantId: tenantOf(principal),
      frameworkId: dto.frameworkId as Uuid,
      employeeId: dto.employeeId as Uuid,
      observerId: dto.observerId as Uuid,
      observationType: dto.observationType,
      ...(dto.observedOn !== undefined ? { observedOn: dto.observedOn } : {}),
      ...(dto.context !== undefined ? { context: dto.context } : {}),
    });
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/conduct")
  @HttpCode(200)
  async conduct(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Observation> {
    const dto = parseBody(conductObservationSchema, body);
    return this.service.conduct(tenantOf(principal), id as Uuid, toConductParams(dto));
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Observation> {
    const dto = parseBody(conductObservationSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, toConductParams(dto));
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/share")
  @HttpCode(200)
  async share(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Observation> {
    return this.service.share(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_WRITE)
  @Post(":id/acknowledge")
  @HttpCode(200)
  async acknowledge(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Observation> {
    return this.service.acknowledge(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Observation[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-employee/:employeeId")
  async listForEmployee(
    @CurrentPrincipal() principal: Principal,
    @Param("employeeId") employeeId: string,
  ): Promise<Observation[]> {
    return this.service.listForEmployee(tenantOf(principal), employeeId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get("by-observer/:observerId")
  async listForObserver(
    @CurrentPrincipal() principal: Principal,
    @Param("observerId") observerId: string,
  ): Promise<Observation[]> {
    return this.service.listForObserver(tenantOf(principal), observerId as Uuid);
  }

  @RequirePermissions(FACULTY_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Observation> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
