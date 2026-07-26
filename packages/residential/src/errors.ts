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

// --- Hostel ----------------------------------------------------------------------

/** The requested hostel does not exist in the current tenant. */
export class HostelNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Hostel "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A hostel must carry a non-empty code. */
export class EmptyHostelCodeError extends PlatformError {
  constructor() {
    super("A hostel must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A hostel must carry a non-empty name. */
export class EmptyHostelNameError extends PlatformError {
  constructor() {
    super("A hostel must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The hostel code is already in use within the tenant. */
export class DuplicateHostelCodeError extends PlatformError {
  constructor(code: string) {
    super(`Hostel code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested hostel lifecycle transition is not permitted. */
export class InvalidHostelTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition hostel from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The hostel is not active, so it cannot take rooms or allocations. */
export class HostelNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Hostel "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Warden ----------------------------------------------------------------------

/** The requested warden does not exist in the current tenant. */
export class WardenNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Warden "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The employee is already registered as a warden within the tenant. */
export class DuplicateWardenForEmployeeError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" is already registered as a warden`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** The requested warden lifecycle transition is not permitted. */
export class InvalidWardenTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition warden from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The warden is not active, so it cannot be assigned to supervise a hostel. */
export class WardenNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Warden "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Room ------------------------------------------------------------------------

/** The requested room does not exist in the current tenant. */
export class RoomNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Room "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A room must carry a non-empty room number. */
export class EmptyRoomNumberError extends PlatformError {
  constructor() {
    super("A room must have a non-empty room number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The room number is already in use within its hostel. */
export class DuplicateRoomNumberError extends PlatformError {
  constructor(hostelId: string, roomNumber: string) {
    super(`Room number "${roomNumber}" is already in use in hostel "${hostelId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { hostelId, roomNumber },
    });
  }
}

/** The requested room lifecycle transition is not permitted. */
export class InvalidRoomTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition room from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A room's beds can only be edited while it is a draft. */
export class RoomNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Room "${id}" is "${status}"; its beds can only be edited while draft`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A room must have at least one bed before it can be made available. */
export class EmptyRoomError extends PlatformError {
  constructor() {
    super("A room must have at least one bed before it can be made available", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The room is not available, so it cannot take bed allocations. */
export class RoomNotAvailableError extends PlatformError {
  constructor(id: string) {
    super(`Room "${id}" is not available`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A bed must carry a non-empty key (its stable identifier within the room). */
export class EmptyBedKeyError extends PlatformError {
  constructor() {
    super("A room bed must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A bed must carry a non-empty label. */
export class EmptyBedLabelError extends PlatformError {
  constructor() {
    super("A room bed must have a non-empty label", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A bed key must be unique within its room. */
export class DuplicateBedKeyError extends PlatformError {
  constructor(key: string) {
    super(`Room bed key "${key}" is already in use in this room`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The requested bed was not found on the room. */
export class BedNotFoundError extends PlatformError {
  constructor(key: string) {
    super(`Room bed "${key}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { key },
    });
  }
}

// --- Bed allocation --------------------------------------------------------------

/** The requested bed allocation does not exist in the current tenant. */
export class AllocationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Bed allocation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The bed already has an active allocation; end it before allocating the bed again. */
export class BedOccupiedError extends PlatformError {
  constructor(roomId: string, bedKey: string) {
    super(`Bed "${bedKey}" in room "${roomId}" is already occupied`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { roomId, bedKey },
    });
  }
}

/** The student already has an active bed allocation; end it before allocating another bed. */
export class StudentAlreadyResidentError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" already has an active bed allocation`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** The requested allocation lifecycle transition is not permitted. */
export class InvalidAllocationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition bed allocation from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Outpass ---------------------------------------------------------------------

/** The requested outpass does not exist in the current tenant. */
export class OutpassNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Outpass "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested outpass lifecycle transition is not permitted. */
export class InvalidOutpassTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition outpass from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** An outpass must have valid out/return times, with the expected return on or after the departure. */
export class InvalidOutpassWindowError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid outpass window: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

/** The student is not a current resident (has no active bed allocation), so cannot be granted an outpass. */
export class StudentNotResidentError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" is not a current resident`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** The resident already has an open outpass; close it before granting another. */
export class ResidentHasOpenOutpassError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" already has an open outpass`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

// --- Roll call -------------------------------------------------------------------

/** The requested roll call does not exist in the current tenant. */
export class RollCallNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Roll call "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested roll-call lifecycle transition is not permitted. */
export class InvalidRollCallTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition roll call from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Residents can only be marked while the roll call is in progress. */
export class RollCallNotInProgressError extends PlatformError {
  constructor(id: string) {
    super(`Roll call "${id}" is not in progress; cannot mark residents`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The resident being marked is not on the roll call's roster. */
export class ResidentNotOnRosterError extends PlatformError {
  constructor(rollCallId: string, residentId: string) {
    super(`Resident "${residentId}" is not on the roster of roll call "${rollCallId}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { rollCallId, residentId },
    });
  }
}

/** The resident has already been marked on this roll call. */
export class DuplicateRollCallMarkError extends PlatformError {
  constructor(rollCallId: string, residentId: string) {
    super(`Resident "${residentId}" has already been marked on roll call "${rollCallId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { rollCallId, residentId },
    });
  }
}

/** A roll-call mark must carry a resident and a time. */
export class InvalidRollCallMarkError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid roll-call mark: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

// --- Hostel inspection -----------------------------------------------------------

/** The requested hostel inspection does not exist in the current tenant. */
export class InspectionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Hostel inspection "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The hostel already has an inspection of this type; re-inspect it instead of recording another. */
export class DuplicateInspectionError extends PlatformError {
  constructor(hostelId: string, type: string) {
    super(`Hostel "${hostelId}" already has a "${type}" inspection`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { hostelId, type },
    });
  }
}

/** A hostel inspection must have valid dates, with the next-due date on or after the conducted date. */
export class InvalidInspectionDatesError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid hostel inspection dates: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

// --- Hostel occupancy profile ----------------------------------------------------

/** The requested hostel occupancy profile does not exist in the current tenant. */
export class HostelOccupancyProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Hostel occupancy profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}
