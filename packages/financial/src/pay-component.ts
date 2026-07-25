import {
  DuplicatePayComponentKeyError,
  EmptyPayComponentKeyError,
  EmptyPayComponentLabelError,
  InvalidMoneyError,
  NegativeAmountError,
} from "./errors";
import { type Money, money } from "./money";

/**
 * A single pay component on a {@link Payslip} — one earning (basic, allowance, …) or one deduction
 * (tax, provident fund, …). The `key` is a stable identifier unique within its list; `amountMinor` is
 * a non-negative whole number of minor units in the payslip's currency. This is where a workforce
 * grade/band becomes a concrete money line.
 */
export interface PayComponent {
  readonly key: string;
  readonly label: string;
  readonly amountMinor: number;
}

export interface PayComponentInput {
  readonly key: string;
  readonly label: string;
  readonly amountMinor: number;
}

/**
 * Normalize and validate a pay-component input — trims text, requires a key and label, and requires a
 * non-negative integer amount (fractional minor units are rejected).
 */
export function makePayComponent(input: PayComponentInput): PayComponent {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyPayComponentKeyError();
  }
  const label = input.label.trim();
  if (label.length === 0) {
    throw new EmptyPayComponentLabelError();
  }
  if (!Number.isInteger(input.amountMinor)) {
    throw new InvalidMoneyError(input.amountMinor);
  }
  if (input.amountMinor < 0) {
    throw new NegativeAmountError(input.amountMinor);
  }
  return { key, label, amountMinor: input.amountMinor };
}

/** Build a pay-component list, rejecting duplicate keys within the list. */
export function buildPayComponents(inputs: readonly PayComponentInput[]): PayComponent[] {
  const seen = new Set<string>();
  const components: PayComponent[] = [];
  for (const input of inputs) {
    const component = makePayComponent(input);
    if (seen.has(component.key)) {
      throw new DuplicatePayComponentKeyError(component.key);
    }
    seen.add(component.key);
    components.push(component);
  }
  return components;
}

/** Sum a pay-component list in minor units. */
export const sumPayComponentsMinor = (components: readonly PayComponent[]): number =>
  components.reduce((sum, c) => sum + c.amountMinor, 0);

/** Sum a pay-component list as {@link Money} in the given currency. */
export const sumPayComponents = (components: readonly PayComponent[], currency: string): Money =>
  money(sumPayComponentsMinor(components), currency);
