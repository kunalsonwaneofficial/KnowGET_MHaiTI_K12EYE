/** Machine-readable platform error codes (generic, not business-specific). */
export type ErrorCode =
  | "INTERNAL_ERROR"
  | "CONFIGURATION_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE";

export interface PlatformErrorOptions {
  readonly code?: ErrorCode;
  readonly httpStatus?: number;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
  /** Operational errors are safe to surface to clients; non-operational are hidden. */
  readonly isOperational?: boolean;
}

/**
 * Base class for all platform errors. Carries a stable code, an HTTP status for
 * transport mapping, optional structured details, and an operational flag that
 * controls whether the message is safe to expose to clients.
 */
export class PlatformError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;
  readonly isOperational: boolean;

  constructor(message: string, options: PlatformErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.httpStatus = options.httpStatus ?? 500;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    // Preserve a clean stack (V8).
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }
}

type SubclassOptions = Omit<PlatformErrorOptions, "code" | "httpStatus">;

/** Unexpected internal failure (hidden from clients). */
export class InternalError extends PlatformError {
  constructor(message = "Internal server error", options: SubclassOptions = {}) {
    super(message, { ...options, code: "INTERNAL_ERROR", httpStatus: 500, isOperational: false });
  }
}

/** Invalid or missing platform configuration (hidden from clients). */
export class ConfigurationError extends PlatformError {
  constructor(message: string, options: SubclassOptions = {}) {
    super(message, {
      ...options,
      code: "CONFIGURATION_ERROR",
      httpStatus: 500,
      isOperational: false,
    });
  }
}

/** Input failed validation (safe to surface). */
export class ValidationError extends PlatformError {
  constructor(message: string, options: SubclassOptions = {}) {
    super(message, { ...options, code: "VALIDATION_ERROR", httpStatus: 400, isOperational: true });
  }
}

/** Requested resource does not exist. */
export class NotFoundError extends PlatformError {
  constructor(message = "Resource not found", options: SubclassOptions = {}) {
    super(message, { ...options, code: "NOT_FOUND", httpStatus: 404, isOperational: true });
  }
}

/** Request conflicts with current state. */
export class ConflictError extends PlatformError {
  constructor(message: string, options: SubclassOptions = {}) {
    super(message, { ...options, code: "CONFLICT", httpStatus: 409, isOperational: true });
  }
}

/** A dependency or the service itself is temporarily unavailable. */
export class UnavailableError extends PlatformError {
  constructor(message = "Service unavailable", options: SubclassOptions = {}) {
    super(message, { ...options, code: "UNAVAILABLE", httpStatus: 503, isOperational: true });
  }
}

/** Type-guard for platform errors. */
export function isPlatformError(error: unknown): error is PlatformError {
  return error instanceof PlatformError;
}
