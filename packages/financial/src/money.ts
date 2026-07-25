import {
  CurrencyMismatchError,
  InvalidAllocationError,
  InvalidCurrencyError,
  InvalidMoneyError,
} from "./errors";

/**
 * A money amount — **integer minor units** (paise, cents, …) plus an ISO 4217 currency code. Money is
 * NEVER a floating-point major-unit value in this platform: representing amounts as whole minor units
 * makes arithmetic exact and rounding explicit. This module is the currency-safe financial core —
 * built and exhaustively tested before any aggregate depends on it; every aggregate that carries an
 * amount carries it as `amountMinor` + `currency`.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

/** Whether a string is a well-formed ISO 4217 currency code (three uppercase letters). */
export const isCurrencyCode = (value: string): boolean => /^[A-Z]{3}$/.test(value);

/** Symmetric half-away-from-zero rounding — deterministic and sign-stable, unlike `Math.round`. */
const roundHalf = (value: number): number => (value < 0 ? -Math.round(-value) : Math.round(value));

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

/** Negate an amount. */
export const negateMoney = (a: Money): Money => ({
  amountMinor: -a.amountMinor,
  currency: a.currency,
});

/** Multiply an amount by a scalar factor, rounding half-away-from-zero to whole minor units. */
export function multiplyMoney(a: Money, factor: number): Money {
  return { amountMinor: roundHalf(a.amountMinor * factor), currency: a.currency };
}

/** A percentage of an amount (e.g. 15 → 15%), rounded to whole minor units. */
export function percentageOf(a: Money, percent: number): Money {
  return { amountMinor: roundHalf((a.amountMinor * percent) / 100), currency: a.currency };
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

/**
 * Split an amount across integer weights so the parts sum **exactly** to the whole — the classic
 * "distribute the pennies" problem. Each part gets the floor of its proportional share; the leftover
 * minor units are handed out one at a time to the parts with the largest fractional remainders
 * (ties broken by order), so no minor unit is created or lost. Requires a non-negative amount and a
 * positive total weight.
 */
export function allocateMoney(a: Money, weights: readonly number[]): Money[] {
  if (a.amountMinor < 0) {
    throw new InvalidAllocationError("the amount must be non-negative");
  }
  if (weights.length === 0) {
    throw new InvalidAllocationError("at least one weight is required");
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new InvalidAllocationError("weights must be finite and non-negative");
  }
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) {
    throw new InvalidAllocationError("the total weight must be positive");
  }

  const rawShares = weights.map((w) => (a.amountMinor * w) / totalWeight);
  const parts = rawShares.map((r) => Math.floor(r));
  let remainder = a.amountMinor - parts.reduce((s, p) => s + p, 0);

  const byFraction = rawShares
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((x, y) => y.frac - x.frac || x.i - y.i);

  let k = 0;
  while (remainder > 0) {
    const target = byFraction[k % byFraction.length];
    if (target) {
      parts[target.i] = (parts[target.i] ?? 0) + 1;
    }
    remainder -= 1;
    k += 1;
  }

  return parts.map((amountMinor) => ({ amountMinor, currency: a.currency }));
}
