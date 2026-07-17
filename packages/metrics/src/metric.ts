export type MetricType = "counter" | "gauge" | "histogram";

/** Label dimensions attached to a metric sample. */
export type Labels = Readonly<Record<string, string>>;

/** A single exported measurement. */
export interface Sample {
  readonly name: string;
  readonly labels: Labels;
  readonly value: number;
}

/** Canonical, order-independent key for a label set (used for storage + export). */
export function labelKey(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  return entries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(",");
}

/** Base for label-partitioned instruments. */
export abstract class LabeledInstrument {
  protected readonly byLabel = new Map<string, { labels: Labels; value: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: readonly string[] = [],
  ) {}

  abstract readonly type: MetricType;

  protected entry(labels: Labels): { labels: Labels; value: number } {
    const key = labelKey(labels);
    let entry = this.byLabel.get(key);
    if (!entry) {
      entry = { labels, value: 0 };
      this.byLabel.set(key, entry);
    }
    return entry;
  }

  /** Current samples for this instrument. */
  collect(): Sample[] {
    return [...this.byLabel.values()].map((e) => ({
      name: this.name,
      labels: e.labels,
      value: e.value,
    }));
  }
}
