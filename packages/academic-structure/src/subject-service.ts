import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { subjectRegistered, subjectUpdated } from "./academic-structure-events";
import {
  DuplicateSubjectError,
  OrganizationNotFoundForAcademicError,
  SubjectNotFoundError,
} from "./errors";
import type { OrganizationDirectory, SubjectRepository } from "./ports";
import {
  activateSubject,
  addPrerequisite,
  archiveSubject,
  createSubject,
  removePrerequisite,
  renameSubject,
  setCrossDisciplinary,
  setElectiveGroup,
  setSubjectCredits,
  setSubjectKind,
  type Subject,
  type SubjectKind,
} from "./subject";

export interface SubjectServiceDeps {
  readonly repository: SubjectRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateSubjectInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly kind: SubjectKind;
  readonly credits?: number | null;
  readonly electiveGroup?: string | null;
  readonly crossDisciplinary?: boolean;
}

/**
 * Application service for subjects. Registers at most one subject per (organization, code)
 * against a validated Organization, and manages kind (mandatory/elective), credits,
 * elective group, cross-disciplinary flag and prerequisite subjects. Publishes
 * {@link subjectRegistered} on registration and {@link subjectUpdated} on every change
 * (the subject's version increments each time).
 */
export class SubjectService {
  private readonly repository: SubjectRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SubjectServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateSubjectInput): Promise<Subject> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertNoSubject(input.tenantId, input.organizationId, input.code);
    const subject = createSubject(input);
    await this.repository.save(subject);
    await this.emit(subjectRegistered(subject));
    return subject;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => renameSubject(s, name));
  }

  async setKind(tenantId: TenantId, id: Uuid, kind: SubjectKind): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => setSubjectKind(s, kind));
  }

  async setCredits(tenantId: TenantId, id: Uuid, credits: number | null): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => setSubjectCredits(s, credits));
  }

  async setElectiveGroup(tenantId: TenantId, id: Uuid, group: string | null): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => setElectiveGroup(s, group));
  }

  async setCrossDisciplinary(
    tenantId: TenantId,
    id: Uuid,
    crossDisciplinary: boolean,
  ): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => setCrossDisciplinary(s, crossDisciplinary));
  }

  async addPrerequisite(tenantId: TenantId, id: Uuid, prerequisiteId: Uuid): Promise<Subject> {
    await this.require(tenantId, prerequisiteId);
    return this.mutate(tenantId, id, (s) => addPrerequisite(s, prerequisiteId));
  }

  async removePrerequisite(tenantId: TenantId, id: Uuid, prerequisiteId: Uuid): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => removePrerequisite(s, prerequisiteId));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => archiveSubject(s));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<Subject> {
    return this.mutate(tenantId, id, (s) => activateSubject(s));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Subject> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<Subject | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async list(tenantId: TenantId): Promise<Subject[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Subject[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (subject: Subject) => Subject,
  ): Promise<Subject> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(subjectUpdated(updated));
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForAcademicError(organizationId);
    }
  }

  private async assertNoSubject(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<void> {
    if (await this.repository.findByCode(tenantId, organizationId, code)) {
      throw new DuplicateSubjectError(organizationId, code);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Subject> {
    const subject = await this.repository.findById(tenantId, id);
    if (!subject) {
      throw new SubjectNotFoundError(id);
    }
    return subject;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
