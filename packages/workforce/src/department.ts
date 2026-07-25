import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyDepartmentCodeError,
  EmptyDepartmentNameError,
  InvalidDepartmentTransitionError,
} from "./errors";
import type { DepartmentStatus } from "./workforce-value";

/**
 * A department — the HR organizational unit within an institution. Departments are hierarchical
 * (a department may sit under a parent department), belong to an {@link Organization} node
 * (campus / institution), may name a head employee and a finance cost centre, and follow a simple
 * `active → archived` lifecycle (a department is archived, never deleted, so institutional history
 * is preserved). Positions and employees are organised under departments.
 */
export interface Department {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly parentDepartmentId: Uuid | null;
  readonly headEmployeeId: Uuid | null;
  readonly costCenter: string | null;
  readonly description: string | null;
  readonly status: DepartmentStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateDepartmentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly parentDepartmentId?: Uuid | null;
  readonly costCenter?: string | null;
  readonly description?: string | null;
}

/** Create an active department. Code and name are required and trimmed. */
export function createDepartment(params: CreateDepartmentParams): Department {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyDepartmentCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyDepartmentNameError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    parentDepartmentId: params.parentDepartmentId ?? null,
    headEmployeeId: null,
    costCenter: params.costCenter?.trim() || null,
    description: params.description?.trim() || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (department: Department, patch: Partial<Department>): Department => ({
  ...department,
  ...patch,
  updatedAt: nowIso(),
});

/** Rename a department. */
export function renameDepartment(department: Department, name: string): Department {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyDepartmentNameError();
  }
  return touch(department, { name: trimmed });
}

/** Set (or clear, with `null`) the department's finance cost centre. */
export const setCostCenter = (department: Department, costCenter: string | null): Department =>
  touch(department, { costCenter: costCenter?.trim() || null });

/** Set (or clear) the department's description. */
export const setDepartmentDescription = (
  department: Department,
  description: string | null,
): Department => touch(department, { description: description?.trim() || null });

/** Assign (or clear, with `null`) the department head. */
export const assignDepartmentHead = (
  department: Department,
  headEmployeeId: Uuid | null,
): Department => touch(department, { headEmployeeId });

/** Move the department under a new parent (or to the top level with `null`). */
export const reparentDepartment = (
  department: Department,
  parentDepartmentId: Uuid | null,
): Department => touch(department, { parentDepartmentId });

/** Archive an active department (preserving history; positions/employees are unaffected here). */
export function archiveDepartment(department: Department): Department {
  if (department.status !== "active") {
    throw new InvalidDepartmentTransitionError(department.status, "archived");
  }
  return touch(department, { status: "archived", headEmployeeId: null });
}

/** Reactivate an archived department. */
export function reactivateDepartment(department: Department): Department {
  if (department.status !== "archived") {
    throw new InvalidDepartmentTransitionError(department.status, "active");
  }
  return touch(department, { status: "active" });
}

/** Whether the department is currently active. */
export const isDepartmentActive = (department: Department): boolean =>
  department.status === "active";
