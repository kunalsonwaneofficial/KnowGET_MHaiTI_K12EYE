import { newUuid } from "@knowget/shared";
import {
  type AttributeValue,
  type FinishedSpan,
  RecordingSpan,
  type Span,
  type SpanContext,
} from "./span";

/** Destination for finished spans. */
export interface SpanExporter {
  export(span: FinishedSpan): void;
}

/** Collects finished spans in memory (tests, diagnostics, buffered forwarding). */
export class InMemorySpanExporter implements SpanExporter {
  private readonly buffer: FinishedSpan[] = [];

  export(span: FinishedSpan): void {
    this.buffer.push(span);
  }

  get spans(): readonly FinishedSpan[] {
    return this.buffer;
  }

  reset(): void {
    this.buffer.length = 0;
  }
}

export interface StartSpanOptions {
  /** Parent span to continue a trace from; a new trace starts when omitted. */
  readonly parent?: SpanContext;
  /** Explicit trace id (e.g. an inbound correlation/trace id) for a root span. */
  readonly traceId?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
}

export interface TracerOptions {
  readonly clock?: () => number;
  readonly idGenerator?: () => string;
}

/**
 * Creates spans and exports them when they end. A span started with a `parent`
 * inherits its `traceId` (child span); otherwise it opens a new trace, adopting
 * an inbound `traceId` when provided — the bridge from the platform's
 * correlation/trace id to first-class spans (resolves the correlation-id-only
 * limitation). Time and id generation are injectable for deterministic tests.
 */
export class Tracer {
  private readonly clock: () => number;
  private readonly idGenerator: () => string;

  constructor(
    private readonly exporter: SpanExporter,
    options: TracerOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idGenerator = options.idGenerator ?? (() => newUuid());
  }

  startSpan(name: string, options: StartSpanOptions = {}): Span {
    const traceId = options.parent?.traceId ?? options.traceId ?? this.idGenerator();
    const context: SpanContext = {
      traceId,
      spanId: this.idGenerator(),
      ...(options.parent ? { parentSpanId: options.parent.spanId } : {}),
    };
    const span = new RecordingSpan(name, context, this.clock(), this.clock, (finished) =>
      this.exporter.export(finished),
    );
    if (options.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        span.setAttribute(key, value);
      }
    }
    return span;
  }
}
