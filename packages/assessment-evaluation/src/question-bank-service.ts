import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateQuestionBankError,
  OrganizationNotFoundForAssessmentError,
  QuestionBankNotFoundError,
  SubjectNotFoundForAssessmentError,
} from "./errors";
import {
  activateQuestionBank,
  addQuestion,
  archiveQuestionBank,
  createQuestionBank,
  type QuestionBank,
  type QuestionInput,
  removeQuestion,
  renameQuestionBank,
  reviseQuestionBank,
  updateQuestion,
} from "./question-bank";
import type { OrganizationDirectory, QuestionBankRepository, SubjectDirectory } from "./ports";

export interface QuestionBankServiceDeps {
  readonly repository: QuestionBankRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects?: SubjectDirectory;
}

export interface CreateQuestionBankInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly title: string;
  readonly subjectId?: Uuid | null;
}

/**
 * Application service for question banks. Registers at most one bank per (organization, code)
 * against a validated Organization (and, when mapped, a validated Subject), manages its
 * questions (each mapped to Bloom's, competencies and curriculum outcomes), and drives its
 * version-controlled draft → active → archived lifecycle for reuse.
 */
export class QuestionBankService {
  private readonly repository: QuestionBankRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory | undefined;

  constructor(deps: QuestionBankServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
  }

  async create(input: CreateQuestionBankInput): Promise<QuestionBank> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAssessmentError(input.organizationId);
    }
    if (
      input.subjectId &&
      this.subjects &&
      !(await this.subjects.exists(input.tenantId, input.subjectId))
    ) {
      throw new SubjectNotFoundForAssessmentError(input.subjectId);
    }
    if (await this.repository.findByCode(input.tenantId, input.organizationId, input.code)) {
      throw new DuplicateQuestionBankError(input.organizationId, input.code);
    }
    const bank = createQuestionBank(input);
    await this.repository.save(bank);
    return bank;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<QuestionBank> {
    return this.mutate(tenantId, id, (b) => renameQuestionBank(b, title));
  }

  async addQuestion(tenantId: TenantId, id: Uuid, input: QuestionInput): Promise<QuestionBank> {
    return this.mutate(tenantId, id, (b) => addQuestion(b, input));
  }

  async updateQuestion(
    tenantId: TenantId,
    id: Uuid,
    questionId: Uuid,
    input: QuestionInput,
  ): Promise<QuestionBank> {
    return this.mutate(tenantId, id, (b) => updateQuestion(b, questionId, input));
  }

  async removeQuestion(tenantId: TenantId, id: Uuid, questionId: Uuid): Promise<QuestionBank> {
    return this.mutate(tenantId, id, (b) => removeQuestion(b, questionId));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<QuestionBank> {
    return this.mutate(tenantId, id, (b) => activateQuestionBank(b));
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<QuestionBank> {
    return this.mutate(tenantId, id, (b) => reviseQuestionBank(b, note));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<QuestionBank> {
    return this.mutate(tenantId, id, (b) => archiveQuestionBank(b));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<QuestionBank> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<QuestionBank | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<QuestionBank[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async listForSubject(tenantId: TenantId, subjectId: Uuid): Promise<QuestionBank[]> {
    return this.repository.listBySubject(tenantId, subjectId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (bank: QuestionBank) => QuestionBank,
  ): Promise<QuestionBank> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<QuestionBank> {
    const bank = await this.repository.findById(tenantId, id);
    if (!bank) {
      throw new QuestionBankNotFoundError(id);
    }
    return bank;
  }
}
