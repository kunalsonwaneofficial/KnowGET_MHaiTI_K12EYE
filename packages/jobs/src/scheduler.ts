/** A task run by the scheduler. */
export type ScheduledTask = () => Promise<void> | void;

interface Entry {
  readonly name: string;
  readonly task: ScheduledTask;
  readonly intervalMs: number | null;
  nextRunAt: number;
}

/**
 * Deterministic in-memory scheduler for recurring and one-shot tasks. Time is
 * advanced explicitly by {@link tick} (driven by a real timer in production, or
 * a test clock in unit tests), so scheduling behaviour is fully reproducible.
 * Recurring tasks advance by exactly one interval per due tick (no unbounded
 * catch-up). A distributed scheduler can replace it behind the same surface.
 */
export class Scheduler {
  private readonly entries = new Map<string, Entry>();
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  /** Schedule a recurring task; the first run occurs after `intervalMs` (or at `startAt`). */
  schedule(name: string, intervalMs: number, task: ScheduledTask, startAt?: number): void {
    if (intervalMs <= 0) {
      throw new Error("intervalMs must be positive");
    }
    this.entries.set(name, {
      name,
      task,
      intervalMs,
      nextRunAt: startAt ?? this.clock() + intervalMs,
    });
  }

  /** Schedule a one-shot task to run at (or after) `runAt`. */
  scheduleOnce(name: string, runAt: number, task: ScheduledTask): void {
    this.entries.set(name, { name, task, intervalMs: null, nextRunAt: runAt });
  }

  cancel(name: string): boolean {
    return this.entries.delete(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Run every task that is due as of now; returns the number run. */
  async tick(): Promise<number> {
    const now = this.clock();
    const due = [...this.entries.values()].filter((entry) => entry.nextRunAt <= now);
    for (const entry of due) {
      await entry.task();
      if (entry.intervalMs === null) {
        this.entries.delete(entry.name);
      } else {
        entry.nextRunAt += entry.intervalMs;
      }
    }
    return due.length;
  }
}
