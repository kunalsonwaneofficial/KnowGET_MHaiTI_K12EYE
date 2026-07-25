import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  activateClass,
  archiveClass,
  assignClassCurriculum,
  createAcademicClass,
  renameClass,
} from "./academic-class";
import { EmptyClassFieldError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const GRADE = "33333333-3333-3333-3333-333333333333" as Uuid;
const CURRICULUM = "44444444-4444-4444-4444-444444444444" as Uuid;

const klass = () =>
  createAcademicClass({
    tenantId: TENANT,
    organizationId: ORG,
    gradeId: GRADE,
    academicYear: " 2026-2027 ",
    name: " Grade 5 ",
  });

describe("academic class aggregate", () => {
  it("creates an active class, trimming year and name", () => {
    const c = klass();
    expect(c.academicYear).toBe("2026-2027");
    expect(c.name).toBe("Grade 5");
    expect(c.gradeId).toBe(GRADE);
    expect(c.curriculumFrameworkId).toBeNull();
    expect(c.status).toBe("active");
    expect(() => createAcademicClass({ ...klass(), name: " " })).toThrow(EmptyClassFieldError);
  });

  it("assigns and clears the curriculum, renames and toggles lifecycle", () => {
    let c = assignClassCurriculum(klass(), CURRICULUM);
    expect(c.curriculumFrameworkId).toBe(CURRICULUM);
    c = assignClassCurriculum(c, null);
    expect(c.curriculumFrameworkId).toBeNull();
    c = renameClass(c, "Grade 5 Morning");
    expect(c.name).toBe("Grade 5 Morning");
    const archived = archiveClass(c);
    expect(archived.status).toBe("archived");
    expect(activateClass(archived).status).toBe("active");
  });
});
