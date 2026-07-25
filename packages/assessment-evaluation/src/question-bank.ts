import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyQuestionBankFieldError,
  QuestionBankArchivedError,
  QuestionBankStateError,
  QuestionNotFoundError,
} from "./errors";
import type {
  BloomLevel,
  DifficultyLevel,
  Question,
  QuestionBankRevision,
  QuestionBankStatus,
  QuestionType,
} from "./question-value";

/**
 * A reusable repository of questions for a subject — each question mapped to Bloom's taxonomy,
 * competencies and curriculum outcomes so the bank can be categorised, searched and reused.
 * Version-controlled (counter + revision log), one per (organization, code), across
 * draft → active → archived; only an active bank is offered for reuse.
 */
export interface QuestionBank {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly title: string;
  readonly subjectId: Uuid | null;
  readonly questions: readonly Question[];
  readonly version: number;
  readonly status: QuestionBankStatus;
  readonly revisions: readonly QuestionBankRevision[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateQuestionBankParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly title: string;
  readonly subjectId?: Uuid | null;
}

/** The authored content of a question (its id is assigned by the bank). */
export interface QuestionInput {
  readonly text: string;
  readonly questionType: QuestionType;
  readonly difficulty: DifficultyLevel;
  readonly bloomLevel?: BloomLevel | null;
  readonly marks?: number;
  readonly competencies?: readonly string[];
  readonly learningOutcomeIds?: readonly Uuid[];
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyQuestionBankFieldError(field);
  }
  return trimmed;
};

const nonNegative = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;

const touch = (bank: QuestionBank, patch: Partial<QuestionBank>): QuestionBank => ({
  ...bank,
  ...patch,
  updatedAt: nowIso(),
});

const assertNotArchived = (bank: QuestionBank): void => {
  if (bank.status === "archived") {
    throw new QuestionBankArchivedError(bank.id);
  }
};

const buildQuestion = (id: Uuid, input: QuestionInput): Question => ({
  id,
  text: requireText(input.text, "question text"),
  questionType: input.questionType,
  difficulty: input.difficulty,
  bloomLevel: input.bloomLevel ?? null,
  marks: nonNegative(input.marks, 1),
  competencies: input.competencies ? [...input.competencies] : [],
  learningOutcomeIds: input.learningOutcomeIds ? [...input.learningOutcomeIds] : [],
});

/** Create a new draft question bank at version 1. */
export function createQuestionBank(params: CreateQuestionBankParams): QuestionBank {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code: requireText(params.code, "code"),
    title: requireText(params.title, "title"),
    subjectId: params.subjectId ?? null,
    questions: [],
    version: 1,
    status: "draft",
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename the bank. Not permitted once archived. */
export function renameQuestionBank(bank: QuestionBank, title: string): QuestionBank {
  assertNotArchived(bank);
  return touch(bank, { title: requireText(title, "title") });
}

/** Author and append a new question. Not permitted once archived. */
export function addQuestion(bank: QuestionBank, input: QuestionInput): QuestionBank {
  assertNotArchived(bank);
  const question = buildQuestion(newUuid(), input);
  return touch(bank, { questions: [...bank.questions, question] });
}

/** Replace an existing question's content (keeping its id). Not permitted once archived. */
export function updateQuestion(
  bank: QuestionBank,
  questionId: Uuid,
  input: QuestionInput,
): QuestionBank {
  assertNotArchived(bank);
  if (!bank.questions.some((q) => q.id === questionId)) {
    throw new QuestionNotFoundError(bank.id, questionId);
  }
  const questions = bank.questions.map((q) =>
    q.id === questionId ? buildQuestion(questionId, input) : q,
  );
  return touch(bank, { questions });
}

/** Remove a question from the bank. Not permitted once archived. */
export function removeQuestion(bank: QuestionBank, questionId: Uuid): QuestionBank {
  assertNotArchived(bank);
  if (!bank.questions.some((q) => q.id === questionId)) {
    throw new QuestionNotFoundError(bank.id, questionId);
  }
  return touch(bank, { questions: bank.questions.filter((q) => q.id !== questionId) });
}

/** Activate the bank so it is offered for reuse (draft → active). */
export function activateQuestionBank(bank: QuestionBank): QuestionBank {
  assertNotArchived(bank);
  return touch(bank, { status: "active" });
}

/**
 * Revise the bank — bump the version and append to the revision log, keeping it active. Only an
 * active bank may be revised; a draft must be activated first (revise is not a shortcut into
 * `active`).
 */
export function reviseQuestionBank(bank: QuestionBank, note: string): QuestionBank {
  assertNotArchived(bank);
  if (bank.status !== "active") {
    throw new QuestionBankStateError(bank.id, "active", bank.status);
  }
  const version = bank.version + 1;
  const revision: QuestionBankRevision = {
    version,
    note: requireText(note, "revision note"),
    revisedAt: nowIso(),
  };
  return touch(bank, { version, status: "active", revisions: [...bank.revisions, revision] });
}

/** Archive the bank. Terminal — an archived bank is immutable. */
export function archiveQuestionBank(bank: QuestionBank): QuestionBank {
  return touch(bank, { status: "archived" });
}
