import { nowIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";

/**
 * Time source abstraction. Injecting a clock (instead of calling `Date` inline)
 * keeps time-dependent logic deterministic and testable.
 */
export interface ClockService {
  now(): ISODateString;
  nowMs(): number;
  date(): Date;
}

export class SystemClock implements ClockService {
  now(): ISODateString {
    return nowIso();
  }

  nowMs(): number {
    return Date.now();
  }

  date(): Date {
    return new Date();
  }
}
