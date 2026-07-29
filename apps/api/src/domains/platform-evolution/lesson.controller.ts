import type { Principal } from "@knowget/auth";
import { type Lesson, type LessonOrigin, LessonService } from "@knowget/platform-evolution";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  EVOLUTION_CONTRIBUTE,
  EVOLUTION_MANAGE,
  EVOLUTION_READ,
  actorOf,
  parseBody,
  tenantOf,
} from "./platform-evolution-http";
import {
  recordLessonSchema,
  retainLessonSchema,
  reviseLessonSchema,
  supersedeLessonSchema,
} from "./platform-evolution.dto";
import { PE_LESSON_SERVICE } from "./platform-evolution.tokens";

/**
 * REST surface for lessons (P2-D30) — the half of the contract that says learning feeds institutional memory.
 *
 * The word doing the work in that clause is *feed*. A lesson recorded here is born provisional and stays
 * provisional however well it is written: it becomes retained only when a memory commitment resolves against
 * the knowledge graph, which no route on this surface can do, because retention is a fact about the graph
 * rather than a status somebody sets. A retrospective that produced twelve insights and committed none of them
 * therefore reads as twelve unfinished records — which is the honest reading, and the one an institution that
 * keeps holding retrospectives and keeps relearning the same thing most needs to see.
 *
 * Recording and revising sit under `evolution:contribute`, because the person who watched something go wrong is
 * the person who can state what it taught. Retention and supersession sit under `evolution:manage`: both are
 * claims about the institution's memory as a whole rather than about one lesson, and superseding in particular
 * decides that an earlier conclusion no longer holds.
 *
 * Nothing here deletes. A lesson that turned out to be wrong is superseded by the one that replaced it, and the
 * superseded record stays — an institution that could delete its mistaken conclusions would have no way to
 * notice it had reached the same mistaken conclusion twice.
 */
@Controller("evolution/lessons")
export class LessonController {
  constructor(@Inject(PE_LESSON_SERVICE) private readonly service: LessonService) {}

  /**
   * Write down what the institution concluded, and what produced it. The origin pair is the provenance and it
   * is fixed here: a lesson whose stated source could be edited later would let a conclusion drawn from a
   * disappointing review be reattributed to a successful one.
   */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post()
  @HttpCode(201)
  async record(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Lesson> {
    const dto = parseBody(recordLessonSchema, body);
    return this.service.record({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      lessonKey: dto.lessonKey,
      statement: dto.statement,
      category: dto.category,
      origin: dto.origin,
      originRef: dto.originRef,
      applicability: dto.applicability,
      recordedBy: actorOf(principal),
    });
  }

  /** Say it better, and say where it applies. Admissible while the lesson is still provisional. */
  @RequirePermissions(EVOLUTION_CONTRIBUTE)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Lesson> {
    const dto = parseBody(reviseLessonSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto.statement, dto.applicability);
  }

  /**
   * Record that this lesson has entered institutional memory. The service asks the knowledge graph whether the
   * commitment actually resolved and refuses if it did not, so this route reports retention rather than
   * granting it — the distinction the contract's first clause turns on.
   */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/retain")
  @HttpCode(200)
  async retain(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Lesson> {
    const dto = parseBody(retainLessonSchema, body);
    return this.service.retain(tenantOf(principal), id as Uuid, dto.atPeriod);
  }

  /**
   * Record that a later lesson has replaced this one. The replacement travels as a key rather than an id
   * because supersession is often decided before the replacement is written — the pointer resolves when the
   * successor is recorded, and until then it stands as a statement that this conclusion no longer holds.
   */
  @RequirePermissions(EVOLUTION_MANAGE)
  @Post(":id/supersede")
  @HttpCode(200)
  async supersede(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Lesson> {
    const dto = parseBody(supersedeLessonSchema, body);
    return this.service.supersede(tenantOf(principal), id as Uuid, dto.supersedingLessonKey);
  }

  /** Every lesson in the tenant, provisional and retained alike. */
  @RequirePermissions(EVOLUTION_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly Lesson[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * What the institution actually knows — retained lessons in the order they entered memory. Accumulation order
   * rather than alphabetical, because reading a memory backwards from the newest is how a person checks whether
   * an old conclusion has already been revisited.
   */
  @RequirePermissions(EVOLUTION_READ)
  @Get("retained/:organizationId")
  async listRetained(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly Lesson[]> {
    return this.service.listRetained(tenantOf(principal), organizationId as Uuid);
  }

  /**
   * Everything one review, retrospective or incident taught. This is the read that closes the loop: an adoption
   * review whose verdict was `adjust` and which produced no lesson is a review the institution held and learned
   * nothing from, and that is only visible by asking the origin what came out of it.
   */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-origin/:origin/:originRef")
  async listByOrigin(
    @CurrentPrincipal() principal: Principal,
    @Param("origin") origin: string,
    @Param("originRef") originRef: string,
  ): Promise<readonly Lesson[]> {
    return this.service.listByOrigin(tenantOf(principal), origin as LessonOrigin, originRef);
  }

  /** One lesson by key, which is how a supersession pointer is followed. */
  @RequirePermissions(EVOLUTION_READ)
  @Get("by-key/:lessonKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("lessonKey") lessonKey: string,
  ): Promise<Lesson> {
    return this.service.getByKey(tenantOf(principal), lessonKey);
  }

  /** One lesson, or a 404. */
  @RequirePermissions(EVOLUTION_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Lesson> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
