import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateQuestionBankError,
  QuestionBankArchivedError,
  QuestionBankStateError,
} from "./errors";
import { InMemoryQuestionBankRepository, type OrganizationDirectory } from "./ports";
import { QuestionBankService } from "./question-bank-service";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;

const dir = (allowed: readonly string[]): OrganizationDirectory => ({
  exists: async (_t, id) => allowed.includes(id),
});

describe("QuestionBankService", () => {
  let repository: InMemoryQuestionBankRepository;
  let service: QuestionBankService;

  beforeEach(() => {
    repository = new InMemoryQuestionBankRepository();
    service = new QuestionBankService({ repository, organizations: dir([ORG]) });
  });

  const create = () =>
    service.create({ tenantId: TENANT, organizationId: ORG, code: "QB-MATH", title: "Maths Bank" });

  it("enforces one bank per (organization, code)", async () => {
    await create();
    await expect(create()).rejects.toBeInstanceOf(DuplicateQuestionBankError);
  });

  it("authors, updates and removes questions with generated ids", async () => {
    const bank = await create();
    const withOne = await service.addQuestion(TENANT, bank.id, {
      text: "What is 2 + 2?",
      questionType: "mcq",
      difficulty: "easy",
      bloomLevel: "remember",
      marks: 1,
      competencies: ["numeracy"],
    });
    expect(withOne.questions).toHaveLength(1);
    const qid = withOne.questions[0]!.id;

    const updated = await service.updateQuestion(TENANT, bank.id, qid, {
      text: "What is 3 + 3?",
      questionType: "mcq",
      difficulty: "medium",
      marks: 2,
    });
    expect(updated.questions[0]?.text).toBe("What is 3 + 3?");
    expect(updated.questions[0]?.difficulty).toBe("medium");
    expect(updated.questions[0]?.id).toBe(qid); // id preserved

    const removed = await service.removeQuestion(TENANT, bank.id, qid);
    expect(removed.questions).toHaveLength(0);
  });

  it("activates, revises and freezes an archived bank", async () => {
    const bank = await create();
    await service.activate(TENANT, bank.id);
    const revised = await service.revise(TENANT, bank.id, "added algebra questions");
    expect(revised.version).toBe(2);
    await service.archive(TENANT, bank.id);
    await expect(
      service.addQuestion(TENANT, bank.id, {
        text: "x?",
        questionType: "short_answer",
        difficulty: "hard",
      }),
    ).rejects.toBeInstanceOf(QuestionBankArchivedError);
  });

  it("refuses to revise a draft bank (revise is not a shortcut into active)", async () => {
    const bank = await create();
    expect(bank.status).toBe("draft");
    await expect(service.revise(TENANT, bank.id, "premature")).rejects.toBeInstanceOf(
      QuestionBankStateError,
    );
  });
});
