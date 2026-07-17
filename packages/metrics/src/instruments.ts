import { type Labels, LabeledInstrument, labelKey, type Sample } from "./metric";

/** A monotonically increasing counter. */
export class Counter extends LabeledInstrument {
  readonly type = "counter" as const;

  inc(labels: Labels = {}, value = 1): void {
    if (value < 0) {
      throw new Error("Counter can only increase");
    }
    this.entry(labels).value += value;
  }

  get(labels: Labels = {}): number {
    return this.byLabel.get(labelKey(labels))?.value ?? 0;
  }
}

/** A gauge that can move up or down. */
export class Gauge extends LabeledInstrument {
  readonly type = "gauge" as const;

  set(value: number, labels: Labels = {}): void {
    this.entry(labels).value = value;
  }

  inc(labels: Labels = {}, value = 1): void {
    this.entry(labels).value += value;
  }

  dec(labels: Labels = {}, value = 1): void {
    this.entry(labels).value -= value;
  }

  get(labels: Labels = {}): number {
    return this.byLabel.get(labelKey(labels))?.value ?? 0;
  }
}

export const DEFAULT_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

interface HistogramState {
  readonly labels: Labels;
  readonly counts: number[];
  sum: number;
  count: number;
}

/** A histogram bucketing observations, with cumulative buckets, sum and count. */
export class Histogram extends LabeledInstrument {
  readonly type = "histogram" as const;
  private readonly states = new Map<string, HistogramState>();
  readonly buckets: readonly number[];

  constructor(
    name: string,
    help: string,
    buckets: readonly number[] = DEFAULT_BUCKETS,
    labelNames: readonly string[] = [],
  ) {
    super(name, help, labelNames);
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(value: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    let state = this.states.get(key);
    if (!state) {
      state = { labels, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.states.set(key, state);
    }
    state.sum += value;
    state.count += 1;
    this.buckets.forEach((bound, i) => {
      if (value <= bound) {
        const current = state.counts[i] ?? 0;
        state.counts[i] = current + 1;
      }
    });
  }

  /** Histogram export samples: `_bucket{le}`, `_sum`, `_count`. */
  override collect(): Sample[] {
    const samples: Sample[] = [];
    for (const state of this.states.values()) {
      this.buckets.forEach((bound, i) => {
        samples.push({
          name: `${this.name}_bucket`,
          labels: { ...state.labels, le: String(bound) },
          value: state.counts[i] ?? 0,
        });
      });
      samples.push({
        name: `${this.name}_bucket`,
        labels: { ...state.labels, le: "+Inf" },
        value: state.count,
      });
      samples.push({ name: `${this.name}_sum`, labels: state.labels, value: state.sum });
      samples.push({ name: `${this.name}_count`, labels: state.labels, value: state.count });
    }
    return samples;
  }
}
