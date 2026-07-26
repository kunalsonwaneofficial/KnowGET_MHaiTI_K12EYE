import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a residential record attaches to does not
 * exist in the tenant. Hostels, rooms and roll calls belong to an organization; the domain links to it.
 */
export class OrganizationNotFoundForResidentialError extends PlatformError {
  constructor(organizationId: string) {
    super(
      `Organization "${organizationId}" not found; cannot attach the residential record to it`,
      {
        code: "NOT_FOUND",
        httpStatus: 404,
        isOperational: true,
        details: { organizationId },
      },
    );
  }
}

/** The employee (P2-D12) a warden links to does not exist in the tenant. */
export class EmployeeNotFoundForResidentialError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found; cannot register the warden`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** The student (P2-D03) a residential record is for does not exist in the tenant. */
export class StudentNotFoundForResidentialError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found; cannot attach the residential record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}
