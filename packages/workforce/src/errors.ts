import { PlatformError } from "@knowget/exceptions";

/**
 * The organization (campus / institution node, P2-D01-M01) a workforce record attaches to does not
 * exist in the tenant. Departments and employees belong to an organization; the workforce domain
 * links to it and never duplicates it.
 */
export class OrganizationNotFoundForWorkforceError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the workforce record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

// --- Department ------------------------------------------------------------------

/** The requested department does not exist in the current tenant. */
export class DepartmentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Department "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A department must carry a non-empty code. */
export class EmptyDepartmentCodeError extends PlatformError {
  constructor() {
    super("A department must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A department must carry a non-empty name. */
export class EmptyDepartmentNameError extends PlatformError {
  constructor() {
    super("A department must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The department code is already in use within the tenant. */
export class DuplicateDepartmentCodeError extends PlatformError {
  constructor(code: string) {
    super(`Department code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested department lifecycle transition is not permitted. */
export class InvalidDepartmentTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition department from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A department cannot be its own parent, nor form a cycle in the hierarchy. */
export class DepartmentHierarchyError extends PlatformError {
  constructor(departmentId: string, parentId: string) {
    super(
      `Department "${departmentId}" cannot have "${parentId}" as parent (it would form a cycle)`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { departmentId, parentId },
      },
    );
  }
}

/** A parent department must belong to the same organization as its child. */
export class CrossOrganizationDepartmentError extends PlatformError {
  constructor(departmentId: string, parentId: string) {
    super(
      `Parent department "${parentId}" belongs to a different organization than "${departmentId}"`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { departmentId, parentId },
      },
    );
  }
}

/** A new position cannot be defined under an archived department. */
export class DepartmentNotActiveError extends PlatformError {
  constructor(departmentId: string) {
    super(`Department "${departmentId}" is archived; cannot define a position under it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { departmentId },
    });
  }
}

// --- Position --------------------------------------------------------------------

/** The requested position does not exist in the current tenant. */
export class PositionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Position "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A position must carry a non-empty code. */
export class EmptyPositionCodeError extends PlatformError {
  constructor() {
    super("A position must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A position must carry a non-empty title. */
export class EmptyPositionTitleError extends PlatformError {
  constructor() {
    super("A position must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The position code is already in use within the tenant. */
export class DuplicatePositionCodeError extends PlatformError {
  constructor(code: string) {
    super(`Position code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** A position's approved headcount must be a positive integer. */
export class InvalidHeadcountError extends PlatformError {
  constructor(headcount: number) {
    super(`Position headcount must be a positive integer, received ${headcount}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { headcount },
    });
  }
}

/** The requested position lifecycle transition is not permitted. */
export class InvalidPositionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition position from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/**
 * The person an employee record links to does not exist in the tenant. Every employee is a Person
 * (P2-D01-M02); the workforce domain never duplicates identity.
 */
export class PersonNotFoundForWorkforceError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

// --- Employee --------------------------------------------------------------------

/** The requested employee does not exist in the current tenant. */
export class EmployeeNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Employee "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An employee must carry a non-empty employee number. */
export class EmptyEmployeeNumberError extends PlatformError {
  constructor() {
    super("An employee must have a non-empty employee number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The employee number is already in use within the tenant. */
export class DuplicateEmployeeNumberError extends PlatformError {
  constructor(employeeNumber: string) {
    super(`Employee number "${employeeNumber}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { employeeNumber },
    });
  }
}

/** The requested employee lifecycle transition is not permitted. */
export class InvalidEmployeeTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition employee from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A person may hold at most one active employment per institution. */
export class DuplicateEmploymentError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" already has an active employment at this organization`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId },
    });
  }
}

/** A department or position assigned to an employee must belong to the same organization. */
export class CrossOrganizationAssignmentError extends PlatformError {
  constructor(kind: "department" | "position", id: string) {
    super(`The ${kind} "${id}" belongs to a different organization than the employee`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { kind, id },
    });
  }
}

// --- Employment contract ---------------------------------------------------------

/** The requested employment contract does not exist in the current tenant. */
export class ContractNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Employment contract "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested employment-contract lifecycle transition is not permitted. */
export class InvalidContractTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition employment contract from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Only a draft contract may be edited; an active/expired/terminated one is immutable. */
export class ContractNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Employment contract "${id}" is "${status}" and can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}
