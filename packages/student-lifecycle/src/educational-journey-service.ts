import type { TenantId, Uuid } from "@knowget/types";
import {
  type EducationalJourney,
  type RecordProgressionParams,
  recordProgression,
  startJourney,
} from "./educational-journey";
import {
  DuplicateJourneyError,
  EducationalJourneyNotFoundError,
  StudentNotFoundError,
} from "./errors";
import type { EducationalJourneyRepository, StudentRepository } from "./ports";
import type { Student } from "./student";

export interface EducationalJourneyServiceDeps {
  readonly repository: EducationalJourneyRepository;
  readonly students: StudentRepository;
}

export interface StartJourneyInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
}

/**
 * Application service for educational journeys — the longitudinal academic record.
 * Opens one journey per student (deriving the organization from the student, so the
 * two can never disagree) and appends progression events (promotion, retention,
 * transfer, withdrawal, graduation). The record is append-only and complete.
 */
export class EducationalJourneyService {
  private readonly repository: EducationalJourneyRepository;
  private readonly students: StudentRepository;

  constructor(deps: EducationalJourneyServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
  }

  async start(input: StartJourneyInput): Promise<EducationalJourney> {
    const student = await this.requireStudent(input.tenantId, input.studentId);
    if (await this.repository.findByStudent(input.tenantId, input.studentId)) {
      throw new DuplicateJourneyError(input.studentId);
    }
    const journey = startJourney({
      tenantId: input.tenantId,
      studentId: input.studentId,
      organizationId: student.organizationId,
    });
    await this.repository.save(journey);
    return journey;
  }

  async record(
    tenantId: TenantId,
    id: Uuid,
    params: RecordProgressionParams,
  ): Promise<EducationalJourney> {
    const updated = recordProgression(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EducationalJourney> {
    return this.require(tenantId, id);
  }

  async getForStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalJourney | null> {
    return this.repository.findByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<EducationalJourney[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async requireStudent(tenantId: TenantId, studentId: Uuid): Promise<Student> {
    const student = await this.students.findById(tenantId, studentId);
    if (!student) {
      throw new StudentNotFoundError(studentId);
    }
    return student;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EducationalJourney> {
    const journey = await this.repository.findById(tenantId, id);
    if (!journey) {
      throw new EducationalJourneyNotFoundError(id);
    }
    return journey;
  }
}
