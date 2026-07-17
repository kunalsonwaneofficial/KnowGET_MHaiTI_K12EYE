import { nowIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import { type Alert, type AlertRule, type AlertSink, breaches } from "./alert";

export interface AlertManagerOptions {
  readonly sink?: AlertSink;
  readonly now?: () => ISODateString;
}

/**
 * Evaluates metric readings against a set of threshold rules, tracking which
 * alerts are firing. State transitions (a rule beginning or ceasing to breach)
 * are emitted to the sink exactly once each — a rule that stays breached does
 * not re-fire on every evaluation.
 */
export class AlertManager {
  private readonly firing = new Map<string, Alert>();
  private readonly sink: AlertSink | undefined;
  private readonly now: () => ISODateString;

  constructor(
    private readonly rules: readonly AlertRule[],
    options: AlertManagerOptions = {},
  ) {
    this.sink = options.sink;
    this.now = options.now ?? nowIso;
  }

  /** Evaluate readings (metric name → value); returns the currently-firing alerts. */
  evaluate(readings: Readonly<Record<string, number>>): readonly Alert[] {
    for (const rule of this.rules) {
      const value = readings[rule.metric];
      if (value === undefined) {
        continue;
      }
      const isBreaching = breaches(value, rule.comparator, rule.threshold);
      const wasFiring = this.firing.has(rule.name);

      if (isBreaching && !wasFiring) {
        const alert: Alert = {
          rule: rule.name,
          metric: rule.metric,
          severity: rule.severity,
          value,
          threshold: rule.threshold,
          state: "firing",
          since: this.now(),
        };
        this.firing.set(rule.name, alert);
        this.sink?.(alert);
      } else if (!isBreaching && wasFiring) {
        const previous = this.firing.get(rule.name);
        this.firing.delete(rule.name);
        if (previous) {
          this.sink?.({ ...previous, state: "resolved", value, since: this.now() });
        }
      }
    }
    return this.active;
  }

  get active(): readonly Alert[] {
    return [...this.firing.values()];
  }
}
