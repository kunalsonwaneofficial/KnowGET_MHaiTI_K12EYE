import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyLearningOutcomeFieldError } from "./errors";
import {
  activateLearningOutcome,
  archiveLearningOutcome,
  createLearningOutcome,
  setAssessmentAlignment,
  setBloomLevel,
  setCompetencies,
  setCurriculumAlignment,
  setOutcomeStatement,
} from "./learning-outcome";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const SUBJECT = "33333333-3333-3333-3333-333333333333" as Uuid;
const CURRICULUM = "44444444-4444-4444-4444-444444444444" as Uuid;

const outcome = () =>
  createLearningOutcome({
    tenantId: TENANT,
    organizationId: ORG,
    subjectId: SUBJECT,
    code: " LO-1 ",
    statement: " Solve linear equations ",
    bloomLevel: "apply",
  });

describe("learning outcome aggregate", () => {
  it("defines an active outcome at version 1, trimming fields", () => {
    const o = outcome();
    expect(o.code).toBe("LO-1");
    expect(o.statement).toBe("Solve linear equations");
    expect(o.bloomLevel).toBe("apply");
    expect(o.subjectId).toBe(SUBJECT);
    expect(o.competencies).toEqual([]);
    expect(o.version).toBe(1);
    expect(o.status).toBe("active");
    expect(() => createLearningOutcome({ ...outcome(), statement: " " })).toThrow(
      EmptyLearningOutcomeFieldError,
    );
  });

  it("bumps the version on each edit and normalizes mappings", () => {
    let o = setOutcomeStatement(outcome(), "Solve and graph linear equations");
    expect(o.version).toBe(2);
    o = setBloomLevel(o, "analyze");
    o = setCompetencies(o, [" Problem solving ", "Problem solving", "  ", "Reasoning"]);
    o = setCurriculumAlignment(o, CURRICULUM);
    o = setAssessmentAlignment(o, ["written", "written", "oral"]);
    expect(o.version).toBe(6);
    expect(o.bloomLevel).toBe("analyze");
    expect(o.competencies).toEqual(["Problem solving", "Reasoning"]);
    expect(o.curriculumFrameworkId).toBe(CURRICULUM);
    expect(o.assessmentAlignment).toEqual(["written", "oral"]);
  });

  it("toggles lifecycle", () => {
    const archived = archiveLearningOutcome(outcome());
    expect(archived.status).toBe("archived");
    expect(activateLearningOutcome(archived).status).toBe("active");
  });
});
