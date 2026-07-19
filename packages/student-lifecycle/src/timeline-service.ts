import type { TenantId, Uuid } from "@knowget/types";
import { StudentNotFoundError, TimelineEntryNotFoundError } from "./errors";
import type { StudentRepository, TimelineRepository } from "./ports";
import type { Student } from "./student";
import {
  type RecordTimelineEntryParams,
  recordTimelineEntry,
  type TimelineEntry,
} from "./timeline";

/** Timeline-entry input; the organization is derived from the student. */
export type RecordTimelineInput = Omit<RecordTimelineEntryParams, "organizationId">;

/** Order timeline entries chronologically (by occurrence, then recording time). */
const byTime = (a: TimelineEntry, b: TimelineEntry): number => {
  if (a.occurredOn !== b.occurredOn) {
    return a.occurredOn < b.occurredOn ? -1 : 1;
  }
  return a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0;
};

export interface TimelineServiceDeps {
  readonly repository: TimelineRepository;
  readonly students: StudentRepository;
}

/**
 * Application service for the permanent student timeline. Records immutable
 * institutional events (validating the student exists) and answers the chronological
 * history queries. Append-only — no historical event is ever edited or lost.
 */
export class TimelineService {
  private readonly repository: TimelineRepository;
  private readonly students: StudentRepository;

  constructor(deps: TimelineServiceDeps) {
    this.repository = deps.repository;
    this.students = deps.students;
  }

  async record(input: RecordTimelineInput): Promise<TimelineEntry> {
    const student = await this.requireStudent(input.tenantId, input.studentId);
    const entry = recordTimelineEntry({ ...input, organizationId: student.organizationId });
    await this.repository.save(entry);
    return entry;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<TimelineEntry> {
    const entry = await this.repository.findById(tenantId, id);
    if (!entry) {
      throw new TimelineEntryNotFoundError(id);
    }
    return entry;
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<TimelineEntry[]> {
    return [...(await this.repository.listByStudent(tenantId, studentId))].sort(byTime);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<TimelineEntry[]> {
    return [...(await this.repository.listByOrganization(tenantId, organizationId))].sort(byTime);
  }

  async list(tenantId: TenantId): Promise<TimelineEntry[]> {
    return [...(await this.repository.listByTenant(tenantId))].sort(byTime);
  }

  private async requireStudent(tenantId: TenantId, studentId: Uuid): Promise<Student> {
    const student = await this.students.findById(tenantId, studentId);
    if (!student) {
      throw new StudentNotFoundError(studentId);
    }
    return student;
  }
}
