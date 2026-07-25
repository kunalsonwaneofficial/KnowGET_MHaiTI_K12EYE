import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptySubjectFieldError, InvalidCreditsError, SelfPrerequisiteError } from "./errors";
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
} from "./subject";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const OTHER = "33333333-3333-3333-3333-333333333333" as Uuid;

const subject = () =>
  createSubject({
    tenantId: TENANT,
    organizationId: ORG,
    name: " Mathematics ",
    code: " MATH ",
    kind: "mandatory",
    credits: 5,
  });

describe("subject aggregate", () => {
  it("registers an active subject at version 1, trimming fields", () => {
    const s = subject();
    expect(s.name).toBe("Mathematics");
    expect(s.code).toBe("MATH");
    expect(s.kind).toBe("mandatory");
    expect(s.credits).toBe(5);
    expect(s.crossDisciplinary).toBe(false);
    expect(s.prerequisites).toEqual([]);
    expect(s.version).toBe(1);
    expect(s.status).toBe("active");
  });

  it("rejects a blank field and invalid credits", () => {
    expect(() => createSubject({ ...subject(), name: " " })).toThrow(EmptySubjectFieldError);
    expect(() => createSubject({ ...subject(), credits: -1 })).toThrow(InvalidCreditsError);
  });

  it("bumps the version on every change", () => {
    let s = renameSubject(subject(), "Maths");
    expect(s.version).toBe(2);
    s = setSubjectKind(s, "elective");
    s = setElectiveGroup(s, "Group A");
    s = setCrossDisciplinary(s, true);
    s = setSubjectCredits(s, 4);
    expect(s.version).toBe(6);
    expect(s.kind).toBe("elective");
    expect(s.electiveGroup).toBe("Group A");
    expect(s.crossDisciplinary).toBe(true);
    expect(s.credits).toBe(4);
  });

  it("manages prerequisites, rejecting self-reference and deduplicating", () => {
    const s0 = subject();
    const s1 = addPrerequisite(s0, OTHER);
    expect(s1.prerequisites).toEqual([OTHER]);
    expect(addPrerequisite(s1, OTHER)).toBe(s1); // dedup — no change
    expect(removePrerequisite(s1, OTHER).prerequisites).toEqual([]);
    expect(() => addPrerequisite(s0, s0.id)).toThrow(SelfPrerequisiteError);
  });

  it("toggles lifecycle", () => {
    const archived = archiveSubject(subject());
    expect(archived.status).toBe("archived");
    expect(activateSubject(archived).status).toBe("active");
    expect(() => renameSubject(subject(), " ")).toThrow(EmptySubjectFieldError);
  });
});
