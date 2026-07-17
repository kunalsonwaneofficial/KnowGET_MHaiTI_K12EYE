import type { ISODateString } from "@knowget/types";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertState = "firing" | "resolved";
export type Comparator = "gt" | "gte" | "lt" | "lte" | "eq";

/** A threshold rule evaluated against a named metric reading. */
export interface AlertRule {
  readonly name: string;
  /** Name of the metric reading this rule watches. */
  readonly metric: string;
  readonly comparator: Comparator;
  readonly threshold: number;
  readonly severity: AlertSeverity;
  readonly description?: string;
}

export interface Alert {
  readonly rule: string;
  readonly metric: string;
  readonly severity: AlertSeverity;
  readonly value: number;
  readonly threshold: number;
  readonly state: AlertState;
  readonly since: ISODateString;
}

export type AlertSink = (alert: Alert) => void;

/** Evaluate a comparator against a value and threshold. */
export function breaches(value: number, comparator: Comparator, threshold: number): boolean {
  switch (comparator) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold;
  }
}
