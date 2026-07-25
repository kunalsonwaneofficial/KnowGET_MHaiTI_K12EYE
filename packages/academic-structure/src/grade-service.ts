import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { gradeCreated } from "./academic-structure-events";
import { AcademicProgramNotFoundError, DuplicateGradeError, GradeNotFoundError } from "./errors";
import {
  activateGrade,
  archiveGrade,
  createGrade,
  type Grade,
  renameGrade,
  setAgeGuidelines,
  setGradeLevel,
  setNextGrade,
  setPromotionRule,
} from "./grade";
import type { AcademicProgramRepository, GradeRepository } from "./ports";

export interface GradeServiceDeps {
  readonly repository: GradeRepository;
  readonly programs: AcademicProgramRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateGradeInput {
  readonly tenantId: TenantId;
  readonly programId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly level: number;
  readonly promotionRule?: string | null;
  readonly minAge?: number | null;
  readonly maxAge?: number | null;
}

/**
 * Application service for grades. Creates a grade within a validated Program, deriving the
 * grade's organization from that program so the two can never disagree, at most one per
 * (program, code). Manages the grade's level, promotion target and rule, age guidelines
 * and lifecycle; a promotion target must reference a real grade. Publishes
 * {@link gradeCreated}.
 */
export class GradeService {
  private readonly repository: GradeRepository;
  private readonly programs: AcademicProgramRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: GradeServiceDeps) {
    this.repository = deps.repository;
    this.programs = deps.programs;
    this.events = deps.events;
  }

  async create(input: CreateGradeInput): Promise<Grade> {
    const organizationId = await this.resolveProgramOrganization(input.tenantId, input.programId);
    await this.assertNoGrade(input.tenantId, input.programId, input.code);
    const grade = createGrade({ ...input, organizationId });
    await this.repository.save(grade);
    await this.emit(gradeCreated(grade));
    return grade;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Grade> {
    return this.mutate(tenantId, id, (g) => renameGrade(g, name));
  }

  async setLevel(tenantId: TenantId, id: Uuid, level: number): Promise<Grade> {
    return this.mutate(tenantId, id, (g) => setGradeLevel(g, level));
  }

  async setPromotionRule(tenantId: TenantId, id: Uuid, rule: string | null): Promise<Grade> {
    return this.mutate(tenantId, id, (g) => setPromotionRule(g, rule));
  }

  async setAgeGuidelines(
    tenantId: TenantId,
    id: Uuid,
    minAge: number | null,
    maxAge: number | null,
  ): Promise<Grade> {
    return this.mutate(tenantId, id, (g) => setAgeGuidelines(g, minAge, maxAge));
  }

  async setNextGrade(tenantId: TenantId, id: Uuid, nextGradeId: Uuid | null): Promise<Grade> {
    if (nextGradeId !== null) {
      await this.require(tenantId, nextGradeId);
    }
    return this.mutate(tenantId, id, (g) => setNextGrade(g, nextGradeId));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Grade> {
    return this.mutate(tenantId, id, (g) => archiveGrade(g));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<Grade> {
    return this.mutate(tenantId, id, (g) => activateGrade(g));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Grade> {
    return this.require(tenantId, id);
  }

  async listForProgram(tenantId: TenantId, programId: Uuid): Promise<Grade[]> {
    return this.repository.listByProgram(tenantId, programId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Grade[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<Grade[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async mutate(tenantId: TenantId, id: Uuid, fn: (grade: Grade) => Grade): Promise<Grade> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async resolveProgramOrganization(tenantId: TenantId, programId: Uuid): Promise<Uuid> {
    const program = await this.programs.findById(tenantId, programId);
    if (!program) {
      throw new AcademicProgramNotFoundError(programId);
    }
    return program.organizationId;
  }

  private async assertNoGrade(tenantId: TenantId, programId: Uuid, code: string): Promise<void> {
    if (await this.repository.findByCode(tenantId, programId, code)) {
      throw new DuplicateGradeError(programId, code);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Grade> {
    const grade = await this.repository.findById(tenantId, id);
    if (!grade) {
      throw new GradeNotFoundError(id);
    }
    return grade;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
