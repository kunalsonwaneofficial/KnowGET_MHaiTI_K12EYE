export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
}

export type SpanStatus = "unset" | "ok" | "error";

export type AttributeValue = string | number | boolean;

export interface SpanEvent {
  readonly name: string;
  readonly at: number;
}

/** An immutable record of a completed span. */
export interface FinishedSpan {
  readonly name: string;
  readonly context: SpanContext;
  readonly startTime: number;
  readonly endTime: number;
  readonly durationMs: number;
  readonly status: SpanStatus;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly events: readonly SpanEvent[];
}

/** A live span being recorded. Ending it emits a {@link FinishedSpan}. */
export interface Span {
  readonly context: SpanContext;
  readonly ended: boolean;
  setAttribute(key: string, value: AttributeValue): this;
  addEvent(name: string): this;
  setStatus(status: SpanStatus): this;
  /** End the span, export it, and return the finished record. Idempotent. */
  end(): FinishedSpan;
}

export type SpanSink = (span: FinishedSpan) => void;

export class RecordingSpan implements Span {
  private readonly attributes: Record<string, AttributeValue> = {};
  private readonly events: SpanEvent[] = [];
  private status: SpanStatus = "unset";
  private endTime: number | null = null;
  private finished: FinishedSpan | null = null;

  constructor(
    private readonly name: string,
    readonly context: SpanContext,
    private readonly startTime: number,
    private readonly clock: () => number,
    private readonly sink: SpanSink,
  ) {}

  get ended(): boolean {
    return this.finished !== null;
  }

  setAttribute(key: string, value: AttributeValue): this {
    if (!this.ended) {
      this.attributes[key] = value;
    }
    return this;
  }

  addEvent(name: string): this {
    if (!this.ended) {
      this.events.push({ name, at: this.clock() });
    }
    return this;
  }

  setStatus(status: SpanStatus): this {
    if (!this.ended) {
      this.status = status;
    }
    return this;
  }

  end(): FinishedSpan {
    if (this.finished) {
      return this.finished;
    }
    this.endTime = this.clock();
    this.finished = {
      name: this.name,
      context: this.context,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.endTime - this.startTime,
      status: this.status,
      attributes: { ...this.attributes },
      events: [...this.events],
    };
    this.sink(this.finished);
    return this.finished;
  }
}
