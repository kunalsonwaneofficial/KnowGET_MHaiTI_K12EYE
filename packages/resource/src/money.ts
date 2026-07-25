import { CurrencyMismatchError, InvalidCurrencyError, InvalidMoneyError } from "./errors";

/**
 * A money amount — **integer minor units** (paise, cents, …) plus an ISO 4217 currency code. As in the
 * financial platform (P2-D14), money in the resource domain is NEVER a floating-point major-unit
 * value: procurement spend and asset value are exact by construction. This is a deliberately small,
 * self-contained money module (the resource domain does not depend on `@knowget/financial`); extracting
 * a shared `@knowget/money` package is tracked as technical debt.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

/** Whether a string is a well-formed ISO 4217 currency code (three uppercase letters). */
export const isCurrencyCode = (value: string): boolean => /^[A-Z]{3}$/.test(value);

/** Symmetric half-away-from-zero rounding — deterministic and sign-stable, unlike `Math.round`. */
export const roundHalf = (value: number): number =>
  value < 0 ? -Math.round(-value) : Math.round(value);

/** Construct a validated {@link Money} (integer minor units; valid currency code). */
export function money(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new InvalidMoneyError(amountMinor);
  }
  if (!isCurrencyCode(currency)) {
    throw new InvalidCurrencyError(currency);
  }
  return { amountMinor, currency };
}

/** Zero in a given currency. */
export const zeroMoney = (currency: string): Money => money(0, currency);

/** Assert two amounts share a currency, else {@link CurrencyMismatchError}. */
export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

/** Sum two same-currency amounts. */
export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

/** Subtract `b` from `a` (same currency). */
export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

/** Multiply an amount by an integer quantity — exact (no rounding). */
export function multiplyMoney(a: Money, quantity: number): Money {
  return money(a.amountMinor * quantity, a.currency);
}

/**
 * A pro-rata share of a base amount: `round(baseMinor × numerator / denominator)` half-away-from-zero
 * — the exact primitive the straight-line depreciation engine uses to apportion the depreciable base
 * across the useful life. Requires a positive denominator.
 */
export function prorataMinor(baseMinor: number, numerator: number, denominator: number): number {
  return roundHalf((baseMinor * numerator) / denominator);
}

/** Sum a list of same-currency amounts; `currency` seeds the zero for an empty list. */
export function sumMoney(amounts: readonly Money[], currency: string): Money {
  return amounts.reduce((acc, m) => addMoney(acc, m), zeroMoney(currency));
}

/** Compare two same-currency amounts: -1 if a<b, 0 if equal, 1 if a>b. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) {
    return -1;
  }
  return a.amountMinor > b.amountMinor ? 1 : 0;
}

export const isZeroMoney = (a: Money): boolean => a.amountMinor === 0;
export const isNegativeMoney = (a: Money): boolean => a.amountMinor < 0;
export const isPositiveMoney = (a: Money): boolean => a.amountMinor > 0;
