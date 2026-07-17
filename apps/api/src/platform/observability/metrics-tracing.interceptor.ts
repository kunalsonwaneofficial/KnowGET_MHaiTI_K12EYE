import type { Kernel } from "@knowget/kernel";
import type { Counter, Histogram, MetricsRegistry } from "@knowget/metrics";
import type { Tracer } from "@knowget/tracing";
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Optional,
} from "@nestjs/common";
import { type Observable, finalize, tap } from "rxjs";
import { KERNEL } from "../tokens";
import { METRICS_REGISTRY, TRACER } from "./observability.tokens";

interface HttpRequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly route?: { readonly path?: string };
}

/**
 * Instruments every HTTP request: increments a labelled request counter, records
 * latency into a histogram, and records a span for the request. When a runtime
 * context is present, the request's correlation id becomes the span's trace id —
 * upgrading the platform's correlation tracing to first-class spans.
 */
@Injectable()
export class MetricsTracingInterceptor implements NestInterceptor {
  private readonly requests: Counter;
  private readonly latency: Histogram;

  constructor(
    @Inject(METRICS_REGISTRY) registry: MetricsRegistry,
    @Inject(TRACER) private readonly tracer: Tracer,
    @Optional() @Inject(KERNEL) private readonly kernel?: Kernel,
  ) {
    this.requests = registry.counter("http_requests_total", "Total HTTP requests", [
      "method",
      "outcome",
    ]);
    this.latency = registry.histogram(
      "http_request_duration_seconds",
      "HTTP request duration in seconds",
      undefined,
      ["method"],
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HttpRequestLike>();
    const method = request.method ?? "UNKNOWN";
    const route = request.route?.path ?? request.url ?? "unknown";
    const correlationId = this.kernel?.context.get()?.correlationId;

    const start = Date.now();
    const span = this.tracer.startSpan(`${method} ${route}`, {
      ...(correlationId ? { traceId: correlationId } : {}),
      attributes: { "http.method": method, "http.route": route },
    });
    let outcome = "ok";

    return next.handle().pipe(
      tap({
        error: () => {
          outcome = "error";
          span.setStatus("error");
        },
      }),
      finalize(() => {
        this.requests.inc({ method, outcome });
        this.latency.observe((Date.now() - start) / 1000, { method });
        span.setAttribute("outcome", outcome).end();
      }),
    );
  }
}
