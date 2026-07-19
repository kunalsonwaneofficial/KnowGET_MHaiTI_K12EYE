import type { TenantId, Uuid } from "@knowget/types";
import {
  type EducationalJourney,
  type RecordProgressionParams,
  recordProgression,
  type StartJourneyParams,
  startJourney,
} from "./educational-journey";
import {
  DuplicateJourneyError,
  EducationalJourneyNotFoundError,
  StudentNotFoundError,
} from "./errors";
import type { EducationalJourneyRepository, StudentRepository } from "./ports";

export interface EducationalJourneyServiceDeps {
  readonly repository: EducationalJourneyRepository;
  readonly students: StudentRepository;
}

/**
 * Application service for educational journeys — the longitudinal academic record.
 * Opens one journey per student (validating the student exists) and appends
 * progression events (promotion, retention, transfer, withdrawal, graduation). The
 * record is append-only and complete.
 */
export class EducationalJourneyService {
  private readonly repository: EducationalJourneyRepository;
  private readonly students: StudentRepository;

  constructor(deps: EducationalJourneyServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
  }

  async start(input: StartJourneyParams): Promise<EducationalJourney> {
    await this.assertStudentExists(input.tenantId, input.studentId);
    if (await this.repository.findByStudent(input.tenantId, input.studentId)) {
      throw new DuplicateJourneyError(input.studentId);
    }
    const journey = startJourney(input);
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

  private async assertStudentExists(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (!(await this.students.findById(tenantId, studentId))) {
      throw new StudentNotFoundError(studentId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EducationalJourney> {
    const journey = await this.repository.findById(tenantId, id);
    if (!journey) {
      throw new EducationalJourneyNotFoundError(id);
    }
    return journey;
  }
}
