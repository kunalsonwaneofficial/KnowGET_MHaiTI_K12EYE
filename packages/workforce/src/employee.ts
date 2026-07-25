import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyEmployeeNumberError, InvalidEmployeeTransitionError } from "./errors";
import { type EmploymentStatus, type EmploymentType, isActiveEmployment } from "./workforce-value";

/**
 * An employee — the workforce system of record for a staff member and the HR analog of a
 * {@link Student}. Identity is a {@link Person} (`personId`); the record never duplicates it. The
 * employee is organised under a {@link Department} and a {@link Position}, carries an employee
 * number and an employment type, and follows the lifecycle `onboarding → active`, with reversible
 * `on_leave` / `suspended` / `notice_period`, then a terminal separation `resigned` / `terminated`
 * / `retired` → `alumni`. A person holds at most one active employment per institution.
 */
export interface Employee {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly employeeNumber: string;
  readonly departmentId: Uuid | null;
  readonly positionId: Uuid | null;
  readonly employmentType: EmploymentType;
  readonly status: EmploymentStatus;
  readonly hireDate: string;
  readonly exitDate: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OnboardEmployeeParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly employeeNumber: string;
  readonly employmentType: EmploymentType;
  readonly departmentId?: Uuid | null;
  readonly positionId?: Uuid | null;
  readonly hireDate?: string | null;
}

/** Onboard a staff member (status `onboarding`). Employee number is required and trimmed. */
export function onboardEmployee(params: OnboardEmployeeParams): Employee {
  const employeeNumber = params.employeeNumber.trim();
  if (employeeNumber.length === 0) {
    throw new EmptyEmployeeNumberError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    personId: params.personId,
    employeeNumber,
    departmentId: params.departmentId ?? null,
    positionId: params.positionId ?? null,
    employmentType: params.employmentType,
    status: "onboarding",
    hireDate: params.hireDate ?? now.slice(0, 10),
    exitDate: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (employee: Employee, patch: Partial<Employee>): Employee => ({
  ...employee,
  ...patch,
  updatedAt: nowIso(),
});

const requireStatus = (
  employee: Employee,
  allowed: readonly EmploymentStatus[],
  to: string,
): void => {
  if (!allowed.includes(employee.status)) {
    throw new InvalidEmployeeTransitionError(employee.status, to);
  }
};

/** Statuses in which the employee still occupies a live post (non-terminal). */
const ON_STAFF: readonly EmploymentStatus[] = [
  "onboarding",
  "active",
  "on_leave",
  "suspended",
  "notice_period",
];

/** Begin active service for a newly-onboarded employee. */
export function activateEmployee(employee: Employee): Employee {
  requireStatus(employee, ["onboarding"], "active");
  return touch(employee, { status: "active" });
}

/** Place an active employee on leave. */
export function placeEmployeeOnLeave(employee: Employee): Employee {
  requireStatus(employee, ["active"], "on_leave");
  return touch(employee, { status: "on_leave" });
}

/** Return an employee from leave to active service. */
export function returnEmployeeFromLeave(employee: Employee): Employee {
  requireStatus(employee, ["on_leave"], "active");
  return touch(employee, { status: "active" });
}

/** Suspend an active employee (e.g. pending inquiry). */
export function suspendEmployee(employee: Employee): Employee {
  requireStatus(employee, ["active"], "suspended");
  return touch(employee, { status: "suspended" });
}

/** Reinstate a suspended employee to active service. */
export function reinstateEmployee(employee: Employee): Employee {
  requireStatus(employee, ["suspended"], "active");
  return touch(employee, { status: "active" });
}

/** Move an active employee into their notice period. */
export function giveNotice(employee: Employee): Employee {
  requireStatus(employee, ["active", "on_leave"], "notice_period");
  return touch(employee, { status: "notice_period" });
}

const separate = (
  employee: Employee,
  to: Extract<EmploymentStatus, "resigned" | "terminated" | "retired">,
  allowed: readonly EmploymentStatus[],
  exitDate?: string | null,
): Employee => {
  requireStatus(employee, allowed, to);
  return touch(employee, { status: to, exitDate: exitDate ?? nowIso().slice(0, 10) });
};

/** The employee resigns (from active service, leave or notice period). */
export const resignEmployee = (employee: Employee, exitDate?: string | null): Employee =>
  separate(employee, "resigned", ["active", "on_leave", "notice_period"], exitDate);

/** The institution terminates the employee (from any live status). */
export const terminateEmployee = (employee: Employee, exitDate?: string | null): Employee =>
  separate(employee, "terminated", ON_STAFF, exitDate);

/** The employee retires (from active service, leave or notice period). */
export const retireEmployee = (employee: Employee, exitDate?: string | null): Employee =>
  separate(employee, "retired", ["active", "on_leave", "notice_period"], exitDate);

/** Move a separated employee into the alumni community. */
export function makeEmployeeAlumni(employee: Employee): Employee {
  requireStatus(employee, ["resigned", "terminated", "retired"], "alumni");
  return touch(employee, { status: "alumni" });
}

/** Assign or change the employee's department (while on staff). */
export function assignEmployeeDepartment(employee: Employee, departmentId: Uuid | null): Employee {
  requireStatus(employee, ON_STAFF, "assign_department");
  return touch(employee, { departmentId });
}

/** Assign or change the employee's position (while on staff). */
export function assignEmployeePosition(employee: Employee, positionId: Uuid | null): Employee {
  requireStatus(employee, ON_STAFF, "assign_position");
  return touch(employee, { positionId });
}

/** Set the employee's employment type (while on staff). */
export function setEmployeeEmploymentType(
  employee: Employee,
  employmentType: EmploymentType,
): Employee {
  requireStatus(employee, ON_STAFF, "set_employment_type");
  return touch(employee, { employmentType });
}

/** Whether the employee currently occupies a live post (non-terminal status). */
export const isEmployeeOnStaff = (employee: Employee): boolean =>
  isActiveEmployment(employee.status);
