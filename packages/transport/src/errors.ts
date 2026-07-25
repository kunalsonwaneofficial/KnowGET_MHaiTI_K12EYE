import { PlatformError } from "@knowget/exceptions";

/** A route schedule must have consecutive stops with strictly-increasing, valid time offsets. */
export class InvalidRouteScheduleError extends PlatformError {
  constructor(reason: string) {
    super(`Cannot compute route schedule: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}
