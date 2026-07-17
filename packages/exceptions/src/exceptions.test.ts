import { describe, expect, it } from "vitest";
import { toClientErrorResponse, httpStatusFor } from "./error-response";
import {
  ConfigurationError,
  InternalError,
  NotFoundError,
  PlatformError,
  ValidationError,
  isPlatformError,
} from "./platform-error";

describe("PlatformError", () => {
  it("carries code, status and operational flag", () => {
    const err = new ValidationError("bad input", { details: { field: "email" } });
    expect(err).toBeInstanceOf(PlatformError);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.httpStatus).toBe(400);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe("ValidationError");
  });

  it("marks internal/configuration errors non-operational", () => {
    expect(new InternalError().isOperational).toBe(false);
    expect(new ConfigurationError("missing X").isOperational).toBe(false);
  });

  it("isPlatformError narrows correctly", () => {
    expect(isPlatformError(new NotFoundError())).toBe(true);
    expect(isPlatformError(new Error("plain"))).toBe(false);
  });
});

describe("toClientErrorResponse", () => {
  it("exposes operational errors with details and correlation id", () => {
    const res = toClientErrorResponse(new ValidationError("bad", { details: { field: "x" } }), {
      correlationId: "corr-1",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(res.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "bad",
      correlationId: "corr-1",
      details: { field: "x" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });

  it("hides non-operational error messages by default", () => {
    const res = toClientErrorResponse(new InternalError("db password wrong"), {
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(res.error.message).toBe("An unexpected error occurred");
    expect(res.error.code).toBe("INTERNAL_ERROR");
  });

  it("exposes internal messages when explicitly requested", () => {
    const res = toClientErrorResponse(new InternalError("db password wrong"), {
      exposeInternal: true,
    });
    expect(res.error.message).toBe("db password wrong");
  });

  it("wraps unknown throwables safely", () => {
    const res = toClientErrorResponse("boom");
    expect(res.error.code).toBe("INTERNAL_ERROR");
    expect(res.error.message).toBe("An unexpected error occurred");
  });
});

describe("httpStatusFor", () => {
  it("returns mapped status or 500", () => {
    expect(httpStatusFor(new NotFoundError())).toBe(404);
    expect(httpStatusFor(new Error("x"))).toBe(500);
  });
});
