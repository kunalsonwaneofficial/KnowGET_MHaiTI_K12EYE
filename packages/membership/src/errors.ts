import { PlatformError } from "@knowget/exceptions";

/** The requested membership does not exist in the current tenant. */
export class MembershipNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Membership "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The person already has an active membership in this organization. */
export class DuplicateMembershipError extends PlatformError {
  constructor(personId: string, organizationId: string) {
    super("This person already has an active membership in this organization", {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId, organizationId },
    });
  }
}

/** The requested membership status transition is not permitted. */
export class InvalidMembershipStatusTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition membership from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A membership must grant at least one role. */
export class MembershipRolesRequiredError extends PlatformError {
  constructor() {
    super("A membership must grant at least one role", {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
    });
  }
}

/** No person exists (in the tenant) to attach the membership to. */
export class PersonNotFoundForMembershipError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found; cannot create a membership for it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

/** No organization exists (in the tenant) to attach the membership to. */
export class OrganizationNotFoundForMembershipError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot create a membership for it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** A referenced role is not defined (or not active) in the tenant's catalogue. */
export class UnknownRoleError extends PlatformError {
  constructor(roleName: string) {
    super(`Role "${roleName}" is not defined in this tenant`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { roleName },
    });
  }
}
