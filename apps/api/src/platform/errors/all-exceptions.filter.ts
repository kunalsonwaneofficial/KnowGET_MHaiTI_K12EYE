import { httpStatusFor, toClientErrorResponse } from "@knowget/exceptions";
import type { Kernel } from "@knowget/kernel";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from "@nestjs/common";
import { KERNEL } from "../tokens";

interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

/**
 * Global error boundary. Maps platform errors to their HTTP status with a safe,
 * correlated response envelope; preserves NestJS HttpExceptions; and hides
 * internal (non-operational) details outside development.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(KERNEL) private readonly kernel: Kernel) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponseLike>();
    const correlationId = this.kernel.context.get()?.correlationId;
    const timestamp = this.kernel.clock.now();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: {
          code: `HTTP_${status}`,
          message: exception.message,
          ...(correlationId ? { correlationId } : {}),
          timestamp,
        },
      });
      return;
    }

    const status = httpStatusFor(exception);
    const body = toClientErrorResponse(exception, {
      correlationId,
      exposeInternal: process.env.NODE_ENV !== "production",
      timestamp,
    });
    this.kernel.logger.error("Unhandled exception", {
      correlationId,
      status,
      reason: exception instanceof Error ? exception.message : String(exception),
    });
    response.status(status).json(body);
  }
}
