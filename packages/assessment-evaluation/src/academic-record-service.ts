import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AcademicRecord,
  amendGradeEntries,
  amendPromotionDecision,
  createAcademicRecord,
  publishAcademicRecord,
  setGradeEntries,
  setPromotionDecision,
} from "./academic-record";
import type { GradeEntry, PromotionDecision } from "./academic-record-value";
import { academicRecordUpdated, promotionRecommended } from "./assessment-evaluation-events";
import {
  AcademicRecordNotFoundError,
  DuplicateAcademicRecordError,
  OrganizationNotFoundForAssessmentError,
  StudentNotFoundForAssessmentError,
} from "./errors";
import type { AcademicRecordRepository, OrganizationDirectory, StudentDirectory } from "./ports";

export interface AcademicRecordServiceDeps {
  readonly repository: AcademicRecordRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateAcademicRecordInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly academicYear: string;
  readonly term: string;
  readonly gradeEntries?: readonly GradeEntry[];
}

/**
 * Application service for academic records. Creates a record for a validated Student in a
 * validated Organization, enforcing one record per (student, academic year, term), and drives
 * the draft → published lifecycle plus the controlled, append-only amendment workflow that keeps
 * a published record immutable except through reasoned amendments. Publishes
 * {@link academicRecordUpdated} (on publish and every amendment) and {@link promotionRecommended}
 * (whenever a non-pending promotion decision is set or amended).
 */
export class AcademicRecordService {
  private readonly repository: AcademicRecordRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AcademicRecordServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  async create(input: CreateAcademicRecordInput): Promise<AcademicRecord> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAssessmentError(input.organizationId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForAssessmentError(input.studentId);
    }
    if (
      await this.repository.findByStudentYearTerm(
        input.tenantId,
        input.studentId,
        input.academicYear,
        input.term,
      )
    ) {
      throw new DuplicateAcademicRecordError(input.studentId, input.academicYear, input.term);
    }
    const record = createAcademicRecord(input);
    await this.repository.save(record);
    return record;
  }

  async setGradeEntries(
    tenantId: TenantId,
    id: Uuid,
    gradeEntries: readonly GradeEntry[],
  ): Promise<AcademicRecord> {
    return this.mutate(tenantId, id, (r) => setGradeEntries(r, gradeEntries));
  }

  async setPromotionDecision(
    tenantId: TenantId,
    id: Uuid,
    promotionDecision: PromotionDecision,
  ): Promise<AcademicRecord> {
    const updated = await this.mutate(tenantId, id, (r) =>
      setPromotionDecision(r, promotionDecision),
    );
    if (updated.promotionDecision !== "pending") {
      await this.emit(promotionRecommended(updated));
    }
    return updated;
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<AcademicRecord> {
    const published = await this.mutate(tenantId, id, (r) => publishAcademicRecord(r));
    await this.emit(academicRecordUpdated(published));
    return published;
  }

  async amendGradeEntries(
    tenantId: TenantId,
    id: Uuid,
    gradeEntries: readonly GradeEntry[],
    reason: string,
    amendedBy: Uuid | null = null,
  ): Promise<AcademicRecord> {
    const amended = await this.mutate(tenantId, id, (r) =>
      amendGradeEntries(r, gradeEntries, reason, amendedBy),
    );
    await this.emit(academicRecordUpdated(amended));
    return amended;
  }

  async amendPromotionDecision(
    tenantId: TenantId,
    id: Uuid,
    promotionDecision: PromotionDecision,
    reason: string,
    amendedBy: Uuid | null = null,
  ): Promise<AcademicRecord> {
    const amended = await this.mutate(tenantId, id, (r) =>
      amendPromotionDecision(r, promotionDecision, reason, amendedBy),
    );
    await this.emit(academicRecordUpdated(amended));
    if (amended.promotionDecision !== "pending") {
      await this.emit(promotionRecommended(amended));
    }
    return amended;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AcademicRecord> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<AcademicRecord[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicRecord[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (record: AcademicRecord) => AcademicRecord,
  ): Promise<AcademicRecord> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AcademicRecord> {
    const record = await this.repository.findById(tenantId, id);
    if (!record) {
      throw new AcademicRecordNotFoundError(id);
    }
    return record;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
