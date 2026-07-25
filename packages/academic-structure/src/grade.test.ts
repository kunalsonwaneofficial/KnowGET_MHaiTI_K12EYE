import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyGradeFieldError, InvalidAgeRangeError } from "./errors";
import {
  activateGrade,
  archiveGrade,
  createGrade,
  renameGrade,
  setAgeGuidelines,
  setNextGrade,
  setPromotionRule,
} from "./grade";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PROGRAM = "33333333-3333-3333-3333-333333333333" as Uuid;
const NEXT = "44444444-4444-4444-4444-444444444444" as Uuid;

const grade = () =>
  createGrade({
    tenantId: TENANT,
    organizationId: ORG,
    programId: PROGRAM,
    name: " Grade 1 ",
    code: " G1 ",
    level: 1,
  });

describe("grade aggregate", () => {
  it("creates an active grade, trimming name and code", () => {
    const g = grade();
    expect(g.name).toBe("Grade 1");
    expect(g.code).toBe("G1");
    expect(g.level).toBe(1);
    expect(g.programId).toBe(PROGRAM);
    expect(g.nextGradeId).toBeNull();
    expect(g.status).toBe("active");
  });

  it("rejects blanks and an inverted age range", () => {
    expect(() => createGrade({ ...grade(), name: " " })).toThrow(EmptyGradeFieldError);
    expect(() => createGrade({ ...grade(), minAge: 8, maxAge: 6 })).toThrow(InvalidAgeRangeError);
  });

  it("sets promotion target, rule, level and age guidelines", () => {
    let g = setNextGrade(grade(), NEXT);
    expect(g.nextGradeId).toBe(NEXT);
    g = setPromotionRule(g, "min 40% aggregate");
    expect(g.promotionRule).toBe("min 40% aggregate");
    g = setAgeGuidelines(g, 6, 7);
    expect(g.minAge).toBe(6);
    expect(g.maxAge).toBe(7);
    expect(() => setAgeGuidelines(g, 7, 6)).toThrow(InvalidAgeRangeError);
    expect(setNextGrade(g, null).nextGradeId).toBeNull();
  });

  it("renames and toggles lifecycle", () => {
    const renamed = renameGrade(grade(), "Class 1");
    expect(renamed.name).toBe("Class 1");
    const archived = archiveGrade(renamed);
    expect(archived.status).toBe("archived");
    expect(activateGrade(archived).status).toBe("active");
    expect(() => renameGrade(grade(), " ")).toThrow(EmptyGradeFieldError);
  });
});
