import { nowIso } from "@knowget/shared";
import {
  LOG_LEVEL_SEVERITY,
  type LogContext,
  type Logger,
  type LogLevel,
  type LogRecord,
  type LogSink,
} from "./logger";

const DEFAULT_REDACT_KEYS = ["password", "token", "secret", "authorization", "apikey"];

const defaultSink: LogSink = (record) => {
  // Structured single-line JSON — friendly to log aggregators (P1-M06).
  console.log(JSON.stringify(record));
};

export interface ConsoleLoggerOptions {
  /** Minimum level to emit. Records below this severity are dropped. */
  readonly level?: LogLevel;
  /** Base context merged into every record. */
  readonly base?: LogContext;
  /** Destination for records. Defaults to `console.log` as JSON. */
  readonly sink?: LogSink;
  /** Context keys (case-insensitive) whose values are redacted. */
  readonly redactKeys?: readonly string[];
}

/**
 * Structured, level-filtered logger that emits JSON records. This is the
 * platform default; observability (P1-M06) can supply alternative sinks without
 * any change to calling code.
 */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly base: LogContext;
  private readonly sink: LogSink;
  private readonly redactKeys: readonly string[];

  constructor(options: ConsoleLoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.base = options.base ?? {};
    this.sink = options.sink ?? defaultSink;
    this.redactKeys = (options.redactKeys ?? DEFAULT_REDACT_KEYS).map((k) => k.toLowerCase());
  }

  debug(message: string, context?: LogContext): void {
    this.emit("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.emit("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.emit("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.emit("error", message, context);
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger({
      level: this.level,
      base: { ...this.base, ...context },
      sink: this.sink,
      redactKeys: this.redactKeys,
    });
  }

  private emit(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY[this.level]) {
      return;
    }
    const merged = { ...this.base, ...context };
    const record: LogRecord = {
      level,
      message,
      timestamp: nowIso(),
      ...(Object.keys(merged).length > 0 ? { context: this.redact(merged) } : {}),
    };
    this.sink(record);
  }

  private redact(context: LogContext): LogContext {
    const result: LogContext = {};
    for (const [key, value] of Object.entries(context)) {
      result[key] = this.redactKeys.includes(key.toLowerCase()) ? "[REDACTED]" : value;
    }
    return result;
  }
}

/** Factory for the default structured logger. */
export const createLogger = (options?: ConsoleLoggerOptions): Logger => new ConsoleLogger(options);
