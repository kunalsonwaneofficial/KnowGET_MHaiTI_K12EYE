import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  activateProgram,
  archiveProgram,
  createAcademicProgram,
  renameProgram,
  setProgramDescription,
  setProgramStage,
} from "./academic-program";
import { EmptyProgramFieldError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const program = () =>
  createAcademicProgram({
    tenantId: TENANT,
    organizationId: ORG,
    name: " Primary School ",
    code: " PRIM ",
    stage: "primary",
  });

describe("academic program aggregate", () => {
  it("creates an active program, trimming name and code", () => {
    const p = program();
    expect(p.name).toBe("Primary School");
    expect(p.code).toBe("PRIM");
    expect(p.stage).toBe("primary");
    expect(p.status).toBe("active");
    expect(p.description).toBeNull();
  });

  it("rejects a blank name or code", () => {
    expect(() => createAcademicProgram({ ...program(), name: "  " })).toThrow(
      EmptyProgramFieldError,
    );
    expect(() => createAcademicProgram({ ...program(), code: "" })).toThrow(EmptyProgramFieldError);
  });

  it("renames, sets description and stage, and toggles lifecycle", () => {
    let p = renameProgram(program(), "Lower Primary");
    expect(p.name).toBe("Lower Primary");
    p = setProgramDescription(p, "  Grades 1-5  ");
    expect(p.description).toBe("Grades 1-5");
    p = setProgramDescription(p, "   ");
    expect(p.description).toBeNull();
    p = setProgramStage(p, "middle");
    expect(p.stage).toBe("middle");
    p = archiveProgram(p);
    expect(p.status).toBe("archived");
    expect(activateProgram(p).status).toBe("active");
    expect(() => renameProgram(p, " ")).toThrow(EmptyProgramFieldError);
  });
});
