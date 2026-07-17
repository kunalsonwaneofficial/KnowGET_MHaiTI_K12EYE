import { Counter, DEFAULT_BUCKETS, Gauge, Histogram } from "./instruments";
import { type Labels, type LabeledInstrument, type Sample } from "./metric";

const escapeLabelValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(",")}}`;
}

const formatSample = (sample: Sample): string =>
  `${sample.name}${formatLabels(sample.labels)} ${sample.value}`;

/**
 * A registry of metric instruments with Prometheus text exposition. Instrument
 * accessors are create-or-get (idempotent by name); requesting an existing name
 * as a different type throws. `expose()` renders the standard `# HELP` / `# TYPE`
 * text format consumable by any Prometheus-compatible scraper.
 */
export class MetricsRegistry {
  private readonly instruments = new Map<string, LabeledInstrument>();

  counter(name: string, help: string, labelNames?: readonly string[]): Counter {
    return this.getOrCreate(name, () => new Counter(name, help, labelNames), Counter);
  }

  gauge(name: string, help: string, labelNames?: readonly string[]): Gauge {
    return this.getOrCreate(name, () => new Gauge(name, help, labelNames), Gauge);
  }

  histogram(
    name: string,
    help: string,
    buckets: readonly number[] = DEFAULT_BUCKETS,
    labelNames?: readonly string[],
  ): Histogram {
    return this.getOrCreate(name, () => new Histogram(name, help, buckets, labelNames), Histogram);
  }

  /** Every sample across all registered instruments. */
  collect(): Sample[] {
    return [...this.instruments.values()].flatMap((instrument) => instrument.collect());
  }

  /** Render all metrics in Prometheus text-exposition format. */
  expose(): string {
    const blocks: string[] = [];
    for (const instrument of this.instruments.values()) {
      const lines = [
        `# HELP ${instrument.name} ${instrument.help}`,
        `# TYPE ${instrument.name} ${instrument.type}`,
      ];
      for (const sample of instrument.collect()) {
        lines.push(formatSample(sample));
      }
      blocks.push(lines.join("\n"));
    }
    return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
  }

  private getOrCreate<T extends LabeledInstrument>(
    name: string,
    create: () => T,
    ctor: new (...args: never[]) => T,
  ): T {
    const existing = this.instruments.get(name);
    if (existing) {
      if (!(existing instanceof ctor)) {
        throw new Error(`Metric "${name}" already registered as ${existing.type}`);
      }
      return existing;
    }
    const instrument = create();
    this.instruments.set(name, instrument);
    return instrument;
  }
}
