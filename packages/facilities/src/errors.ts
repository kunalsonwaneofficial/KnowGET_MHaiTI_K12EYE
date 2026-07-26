import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a facilities record attaches to does not exist
 * in the tenant. Buildings, systems and sensors belong to an organization; the domain links to it and
 * never re-models it.
 */
export class OrganizationNotFoundForFacilitiesError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the facilities record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The employee (P2-D12) a work order is assigned to does not exist in the tenant. */
export class EmployeeNotFoundForFacilitiesError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found; cannot assign the work order`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

// --- Building --------------------------------------------------------------------

/** The requested building does not exist in the current tenant. */
export class BuildingNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Building "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A building must carry a non-empty code. */
export class EmptyBuildingCodeError extends PlatformError {
  constructor() {
    super("A building must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A building must carry a non-empty name. */
export class EmptyBuildingNameError extends PlatformError {
  constructor() {
    super("A building must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A building's floor count must be a non-negative integer. */
export class InvalidFloorsError extends PlatformError {
  constructor(floors: number) {
    super(`Floor count "${floors}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { floors },
    });
  }
}

/** The building code is already in use within the tenant. */
export class DuplicateBuildingCodeError extends PlatformError {
  constructor(code: string) {
    super(`Building code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid building status transition was attempted. */
export class InvalidBuildingTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A building cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The building is not active and cannot take the requested operation. */
export class BuildingNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Building "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Space -----------------------------------------------------------------------

/** The requested space does not exist in the current tenant. */
export class SpaceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Space "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A space must carry a non-empty code. */
export class EmptySpaceCodeError extends PlatformError {
  constructor() {
    super("A space must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A space capacity or a building floor must be a non-negative integer. */
export class InvalidCapacityError extends PlatformError {
  constructor(value: number) {
    super(`Value "${value}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** The space code is already in use within the building. */
export class DuplicateSpaceCodeError extends PlatformError {
  constructor(code: string) {
    super(`Space code "${code}" is already in use in this building`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid space status transition was attempted. */
export class InvalidSpaceTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A space cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
