import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CurriculumArchivedError, EmptyCurriculumFieldError } from "./errors";
import {
  activateCurriculum,
  archiveCurriculum,
  createCurriculumFramework,
  reviseCurriculum,
  setCompetencyModel,
  setLearningPhilosophy,
  setSubjectFramework,
} from "./curriculum-framework";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const framework = () =>
  createCurriculumFramework({
    tenantId: TENANT,
    organizationId: ORG,
    name: " CBSE Curriculum ",
    code: " CBSE ",
    board: " CBSE ",
  });

describe("curriculum framework aggregate", () => {
  it("creates a draft framework at version 1, trimming fields", () => {
    const f = framework();
    expect(f.name).toBe("CBSE Curriculum");
    expect(f.code).toBe("CBSE");
    expect(f.board).toBe("CBSE");
    expect(f.version).toBe(1);
    expect(f.status).toBe("draft");
    expect(f.revisions).toEqual([]);
    expect(f.subjectFramework).toEqual([]);
    expect(() => createCurriculumFramework({ ...framework(), board: " " })).toThrow(
      EmptyCurriculumFieldError,
    );
  });

  it("sets philosophy, model and a normalized subject framework", () => {
    let f = setLearningPhilosophy(framework(), "  constructivist  ");
    expect(f.learningPhilosophy).toBe("constructivist");
    f = setCompetencyModel(f, "NCF competencies");
    expect(f.competencyModel).toBe("NCF competencies");
    f = setSubjectFramework(f, [" Languages ", "Languages", "  ", "Sciences"]);
    expect(f.subjectFramework).toEqual(["Languages", "Sciences"]);
  });

  it("activates and version-controls revisions", () => {
    const active = activateCurriculum(framework());
    expect(active.status).toBe("active");
    const r1 = reviseCurriculum(active, "align to 2027 syllabus");
    expect(r1.version).toBe(2);
    expect(r1.revisions).toHaveLength(1);
    expect(r1.revisions[0]?.note).toBe("align to 2027 syllabus");
    const r2 = reviseCurriculum(r1, "add coding subject");
    expect(r2.version).toBe(3);
    expect(r2.revisions).toHaveLength(2);
    expect(() => reviseCurriculum(active, "  ")).toThrow(EmptyCurriculumFieldError);
  });

  it("refuses to modify or revise an archived framework", () => {
    const archived = archiveCurriculum(framework());
    expect(archived.status).toBe("archived");
    expect(() => setLearningPhilosophy(archived, "x")).toThrow(CurriculumArchivedError);
    expect(() => reviseCurriculum(archived, "x")).toThrow(CurriculumArchivedError);
    expect(() => activateCurriculum(archived)).toThrow(CurriculumArchivedError);
  });
});
