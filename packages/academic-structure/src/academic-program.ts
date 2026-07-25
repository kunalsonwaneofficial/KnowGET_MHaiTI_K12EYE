import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyProgramFieldError } from "./errors";
import type { ProgramStage, ProgramStatus } from "./program";

/**
 * An educational program offered by an organization — Pre-Primary, Primary, Middle,
 * Secondary, Higher Secondary, Diploma, and so on. A program groups the grades taught
 * under it; grades, classes and subjects reference the program they belong to. One per
 * (organization, code).
 */
export interface AcademicProgram {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly stage: ProgramStage;
  readonly description: string | null;
  readonly status: ProgramStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAcademicProgramParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly name: string;
  readonly code: string;
  readonly stage: ProgramStage;
  readonly description?: string | null;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyProgramFieldError(field);
  }
  return trimmed;
};

/** Create a new, active academic program. */
export function createAcademicProgram(params: CreateAcademicProgramParams): AcademicProgram {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    name: requireText(params.name, "name"),
    code: requireText(params.code, "code"),
    stage: params.stage,
    description: params.description?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (program: AcademicProgram, patch: Partial<AcademicProgram>): AcademicProgram => ({
  ...program,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename the program. */
export const renameProgram = (program: AcademicProgram, name: string): AcademicProgram =>
  touch(program, { name: requireText(name, "name") });

/** Set (or clear, with null) the program description. */
export const setProgramDescription = (
  program: AcademicProgram,
  description: string | null,
): AcademicProgram => touch(program, { description: description?.trim() || null });

/** Change the program's educational stage. */
export const setProgramStage = (program: AcademicProgram, stage: ProgramStage): AcademicProgram =>
  touch(program, { stage });

/** Archive the program (no longer offered). */
export const archiveProgram = (program: AcademicProgram): AcademicProgram =>
  touch(program, { status: "archived" });

/** Reactivate an archived program. */
export const activateProgram = (program: AcademicProgram): AcademicProgram =>
  touch(program, { status: "active" });
