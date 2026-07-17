import type { ISODateString } from "@knowget/types";

/** A deterministic, manually-advanced clock for reproducible tests. */
export interface ManualClock {
  now(): ISODateString;
  nowMs(): number;
  advance(milliseconds: number): void;
  set(iso: ISODateString): void;
}

/** Create a manual clock starting at the given ISO instant. */
export function createManualClock(
  startIso: ISODateString = "2026-01-01T00:00:00.000Z" as ISODateString,
): ManualClock {
  let ms = Date.parse(startIso);
  return {
    nowMs: () => ms,
    now: () => new Date(ms).toISOString() as ISODateString,
    advance: (milliseconds: number) => {
      ms += milliseconds;
    },
    set: (iso: ISODateString) => {
      ms = Date.parse(iso);
    },
  };
}
