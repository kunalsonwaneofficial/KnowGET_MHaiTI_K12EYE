import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyCycleCodeError,
  EmptyCycleNameError,
  InvalidCycleTransitionError,
  InvalidSeatCapacityError,
} from "./errors";
import type { CycleStatus } from "./admissions-value";

/** A per-grade seat plan within an admission cycle — a grade label and its seat capacity. */
export interface GradeCapacity {
  readonly grade: string;
  readonly capacity: number;
}

/**
 * An admission cycle — an intake season (e.g. "2027-28 Primary Intake") with a per-grade seat plan and an
 * application window. It runs `planning → open → closed → archived`; applications are accepted only while
 * open, the seat plan is editable only before the cycle closes, and archived is terminal. The seat plan (held
 * as JSONB) feeds the intake engine against confirmed enrolments.
 */
export interface AdmissionCycle {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly academicYear: string;
  readonly gradeCapacities: readonly GradeCapacity[];
  readonly opensOn: string | null;
  readonly closesOn: string | null;
  readonly status: CycleStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAdmissionCycleParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly academicYear: string;
  readonly gradeCapacities?: readonly GradeCapacity[];
  readonly opensOn?: string | null;
  readonly closesOn?: string | null;
}

/** Validate + normalize a seat plan: non-negative integer capacities, de-duplicated non-blank grade labels. */
function normalizeGradeCapacities(gradeCapacities: readonly GradeCapacity[]): GradeCapacity[] {
  const seen = new Set<string>();
  return gradeCapacities.map((gc) => {
    const grade = gc.grade.trim();
    if (grade.length === 0 || seen.has(grade)) {
      throw new InvalidSeatCapacityError(gc.capacity);
    }
    seen.add(grade);
    if (!Number.isInteger(gc.capacity) || gc.capacity < 0) {
      throw new InvalidSeatCapacityError(gc.capacity);
    }
    return { grade, capacity: gc.capacity };
  });
}

/** Create an admission cycle (status `planning`). Code and name required; the seat plan validated. */
export function createAdmissionCycle(params: CreateAdmissionCycleParams): AdmissionCycle {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyCycleCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyCycleNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    academicYear: params.academicYear.trim(),
    gradeCapacities: normalizeGradeCapacities(params.gradeCapacities ?? []),
    opensOn: params.opensOn?.trim() || null,
    closesOn: params.closesOn?.trim() || null,
    status: "planning",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (cycle: AdmissionCycle, patch: Partial<AdmissionCycle>): AdmissionCycle => ({
  ...cycle,
  ...patch,
  updatedAt: nowIso(),
});

/** Whether the cycle's configuration is still editable — before it closes or is archived. */
const isConfigurable = (cycle: AdmissionCycle): boolean =>
  cycle.status === "planning" || cycle.status === "open";

/** Rename a cycle; not allowed once closed or archived. */
export function renameCycle(cycle: AdmissionCycle, name: string): AdmissionCycle {
  if (!isConfigurable(cycle)) {
    throw new InvalidCycleTransitionError(cycle.status, "renamed");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyCycleNameError();
  }
  return touch(cycle, { name: trimmed });
}

/** Replace the cycle's per-grade seat plan; not allowed once closed or archived. */
export function setCycleGradeCapacities(
  cycle: AdmissionCycle,
  gradeCapacities: readonly GradeCapacity[],
): AdmissionCycle {
  if (!isConfigurable(cycle)) {
    throw new InvalidCycleTransitionError(cycle.status, "seat-plan-set");
  }
  return touch(cycle, { gradeCapacities: normalizeGradeCapacities(gradeCapacities) });
}

/** Set the cycle's application window; not allowed once closed or archived. */
export function setCycleWindow(
  cycle: AdmissionCycle,
  opensOn: string | null,
  closesOn: string | null,
): AdmissionCycle {
  if (!isConfigurable(cycle)) {
    throw new InvalidCycleTransitionError(cycle.status, "window-set");
  }
  return touch(cycle, { opensOn: opensOn?.trim() || null, closesOn: closesOn?.trim() || null });
}

/** Open a cycle for applications (`planning → open`). */
export function openCycle(cycle: AdmissionCycle): AdmissionCycle {
  if (cycle.status !== "planning") {
    throw new InvalidCycleTransitionError(cycle.status, "open");
  }
  return touch(cycle, { status: "open" });
}

/** Close a cycle to further applications (`open → closed`). */
export function closeCycle(cycle: AdmissionCycle): AdmissionCycle {
  if (cycle.status !== "open") {
    throw new InvalidCycleTransitionError(cycle.status, "closed");
  }
  return touch(cycle, { status: "closed" });
}

/** Archive a cycle (→ `archived`, terminal). */
export function archiveCycle(cycle: AdmissionCycle): AdmissionCycle {
  if (cycle.status === "archived") {
    throw new InvalidCycleTransitionError(cycle.status, "archived");
  }
  return touch(cycle, { status: "archived" });
}

/** Whether the cycle is open (accepting applications). */
export const isCycleOpen = (cycle: AdmissionCycle): boolean => cycle.status === "open";

/** The seat capacity declared for a grade (0 if the grade is not in the plan). */
export const gradeCapacityOf = (cycle: AdmissionCycle, grade: string): number =>
  cycle.gradeCapacities.find((gc) => gc.grade === grade)?.capacity ?? 0;
