import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  activateFramework,
  addCompetency,
  archiveFramework,
  createFramework,
  hasCompetency,
  isFrameworkActive,
  removeCompetency,
  renameFramework,
} from "./competency-framework";
import {
  CompetencyNotFoundError,
  DuplicateCompetencyKeyError,
  EmptyFrameworkCodeError,
  FrameworkNotEditableError,
  InvalidFrameworkTransitionError,
} from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  createFramework({
    tenantId: TENANT,
    organizationId: ORG,
    code: "TEACH-STD",
    name: "Teaching Standards",
    competencies: [
      { key: "ped-1", name: "Planning", domain: "instruction" },
      { key: "mgmt-1", name: "Classroom management" },
    ],
  });

describe("createFramework", () => {
  it("creates a draft framework with competencies", () => {
    const fw = make();
    expect(fw.status).toBe("draft");
    expect(fw.version).toBe(1);
    expect(fw.competencies).toHaveLength(2);
    expect(hasCompetency(fw, "ped-1")).toBe(true);
  });

  it("rejects an empty code and duplicate competency keys", () => {
    expect(() =>
      createFramework({ tenantId: TENANT, organizationId: ORG, code: "  ", name: "X" }),
    ).toThrow(EmptyFrameworkCodeError);
    expect(() =>
      createFramework({
        tenantId: TENANT,
        organizationId: ORG,
        code: "C",
        name: "X",
        competencies: [
          { key: "a", name: "A" },
          { key: "a", name: "A2" },
        ],
      }),
    ).toThrow(DuplicateCompetencyKeyError);
  });
});

describe("framework editing (draft only)", () => {
  it("adds and removes competencies, bumping the version", () => {
    let fw = renameFramework(make(), "Teaching Standards 2025");
    fw = addCompetency(fw, { key: "digital-1", name: "Digital tools" });
    expect(fw.competencies).toHaveLength(3);
    expect(fw.version).toBe(2);
    expect(() => addCompetency(fw, { key: "ped-1", name: "dup" })).toThrow(
      DuplicateCompetencyKeyError,
    );
    fw = removeCompetency(fw, "digital-1");
    expect(fw.competencies).toHaveLength(2);
    expect(fw.version).toBe(3);
    expect(() => removeCompetency(fw, "nope")).toThrow(CompetencyNotFoundError);
  });

  it("freezes competencies once active", () => {
    const active = activateFramework(make());
    expect(isFrameworkActive(active)).toBe(true);
    expect(() => addCompetency(active, { key: "x", name: "X" })).toThrow(FrameworkNotEditableError);
    expect(() => removeCompetency(active, "ped-1")).toThrow(FrameworkNotEditableError);
  });
});

describe("framework lifecycle", () => {
  it("runs draft → active → archived with guards", () => {
    const fw = make();
    const active = activateFramework(fw);
    expect(active.status).toBe("active");
    expect(archiveFramework(active).status).toBe("archived");
    expect(() => activateFramework(active)).toThrow(InvalidFrameworkTransitionError);
    expect(() => archiveFramework(fw)).toThrow(InvalidFrameworkTransitionError);
  });
});
