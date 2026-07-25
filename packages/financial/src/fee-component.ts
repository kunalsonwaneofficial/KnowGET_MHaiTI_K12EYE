import {
  EmptyComponentKeyError,
  EmptyComponentNameError,
  InvalidMoneyError,
  NegativeAmountError,
} from "./errors";
import { type Money, money } from "./money";

/**
 * A single fee component within a {@link FeeStructure} — one named, categorized charge line (tuition,
 * transport, lab, …). The `key` is a stable identifier unique within its structure; `amountMinor` is
 * a non-negative whole number of minor units in the structure's currency. A component never carries
 * its own currency (the structure owns the single currency), so components are always combinable.
 * They are frozen once the structure is active.
 */
export interface FeeComponent {
  readonly key: string;
  readonly name: string;
  readonly category: string | null;
  readonly amountMinor: number;
}

export interface FeeComponentInput {
  readonly key: string;
  readonly name: string;
  readonly category?: string | null;
  readonly amountMinor: number;
}

/**
 * Normalize and validate a fee-component input into a {@link FeeComponent} — trims text, requires a
 * key and name, and requires a non-negative integer amount (fractional minor units are rejected).
 */
export function makeFeeComponent(input: FeeComponentInput): FeeComponent {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyComponentKeyError();
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new EmptyComponentNameError();
  }
  if (!Number.isInteger(input.amountMinor)) {
    throw new InvalidMoneyError(input.amountMinor);
  }
  if (input.amountMinor < 0) {
    throw new NegativeAmountError(input.amountMinor);
  }
  return {
    key,
    name,
    category: input.category?.trim() || null,
    amountMinor: input.amountMinor,
  };
}

/** The component's amount as {@link Money} in the given (structure) currency. */
export const feeComponentMoney = (component: FeeComponent, currency: string): Money =>
  money(component.amountMinor, currency);
