import type { ISODateString } from "@knowget/types";

export type WorkflowStatus = "running" | "completed";

/** An immutable record of a single state transition. */
export interface HistoryEntry {
  readonly from: string;
  readonly to: string;
  readonly event: string;
  readonly at: ISODateString;
}

/**
 * An immutable snapshot of a running (or completed) workflow. The engine never
 * mutates an instance in place; every transition returns a new snapshot with the
 * transition appended to `history`.
 */
export interface WorkflowInstance<TData = Record<string, unknown>> {
  readonly id: string;
  readonly definition: string;
  readonly state: string;
  readonly data: TData;
  readonly history: readonly HistoryEntry[];
  readonly status: WorkflowStatus;
}
