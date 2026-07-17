import { isPlatformError } from "./platform-error";

/** Safe, client-facing error envelope. */
export interface ClientErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly correlationId?: string;
    readonly details?: Record<string, unknown>;
    readonly timestamp: string;
  };
}

export interface ErrorResponseOptions {
  readonly correlationId?: string;
  /** When true, internal (non-operational) messages are exposed (dev/diagnostics). */
  readonly exposeInternal?: boolean;
  readonly timestamp?: string;
}

const GENERIC_MESSAGE = "An unexpected error occurred";

/**
 * Convert any thrown value into a safe client error response. Non-operational
 * errors have their messages/details suppressed unless `exposeInternal` is set.
 */
export function toClientErrorResponse(
  error: unknown,
  options: ErrorResponseOptions = {},
): ClientErrorResponse {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const correlation = options.correlationId ? { correlationId: options.correlationId } : {};

  if (isPlatformError(error)) {
    const safe = error.isOperational || options.exposeInternal === true;
    return {
      error: {
        code: error.code,
        message: safe ? error.message : GENERIC_MESSAGE,
        ...correlation,
        ...(safe && error.details ? { details: error.details } : {}),
        timestamp,
      },
    };
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: options.exposeInternal && error instanceof Error ? error.message : GENERIC_MESSAGE,
      ...correlation,
      timestamp,
    },
  };
}

/** HTTP status code for any thrown value (defaults to 500). */
export function httpStatusFor(error: unknown): number {
  return isPlatformError(error) ? error.httpStatus : 500;
}
