import type { ISODateString } from "@knowget/types";

/** Severity levels in ascending order of importance. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Numeric severity used for level filtering. */
export const LOG_LEVEL_SEVERITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Arbitrary structured context attached to a log record. */
export type LogContext = Record<string, unknown>;

/** A single structured log record. */
export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: ISODateString;
  readonly context?: LogContext;
}

/** Destination for emitted log records. */
export type LogSink = (record: LogRecord) => void;

/**
 * Structured logger contract used across the platform. Concrete implementations
 * (e.g. the console logger below, or future aggregated sinks in P1-M06) must not
 * leak provider specifics to callers.
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Create a child logger whose records inherit the given base context. */
  child(context: LogContext): Logger;
}
