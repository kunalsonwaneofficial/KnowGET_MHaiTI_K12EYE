import {
  EmptyRequisitionLineDescriptionError,
  EmptyRequisitionLineKeyError,
  InvalidMoneyError,
  InvalidQuantityError,
  NegativeAmountError,
} from "./errors";
import { type Money, money } from "./money";

/**
 * A single line on a {@link PurchaseRequisition} — a requested item with a quantity and an estimated
 * unit cost (integer minor units) in the requisition's currency. The `key` is a stable identifier
 * unique within the requisition; the line total is `quantity × estimatedUnitCostMinor`, exact.
 */
export interface RequisitionLine {
  readonly key: string;
  readonly description: string;
  readonly quantity: number;
  readonly estimatedUnitCostMinor: number;
}

export interface RequisitionLineInput {
  readonly key: string;
  readonly description: string;
  readonly quantity: number;
  readonly estimatedUnitCostMinor: number;
}

/** Normalize and validate a requisition-line input (positive integer quantity; non-negative cost). */
export function makeRequisitionLine(input: RequisitionLineInput): RequisitionLine {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyRequisitionLineKeyError();
  }
  const description = input.description.trim();
  if (description.length === 0) {
    throw new EmptyRequisitionLineDescriptionError();
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new InvalidQuantityError(input.quantity);
  }
  if (!Number.isInteger(input.estimatedUnitCostMinor)) {
    throw new InvalidMoneyError(input.estimatedUnitCostMinor);
  }
  if (input.estimatedUnitCostMinor < 0) {
    throw new NegativeAmountError(input.estimatedUnitCostMinor);
  }
  return {
    key,
    description,
    quantity: input.quantity,
    estimatedUnitCostMinor: input.estimatedUnitCostMinor,
  };
}

/** The line's estimated total (`quantity × unit cost`) as {@link Money} in the given currency. */
export const requisitionLineTotal = (line: RequisitionLine, currency: string): Money =>
  money(line.quantity * line.estimatedUnitCostMinor, currency);
