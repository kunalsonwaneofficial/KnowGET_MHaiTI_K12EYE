import type { Uuid } from "@knowget/types";
import {
  EmptyOrderLineDescriptionError,
  EmptyOrderLineKeyError,
  InvalidMoneyError,
  InvalidQuantityError,
  NegativeAmountError,
  OverReceiptError,
} from "./errors";
import { type Money, money } from "./money";

/**
 * A single line on a {@link PurchaseOrder} — an ordered item with a quantity and a unit price (integer
 * minor units) in the order's currency, plus the running `receivedQuantity` as goods arrive. The `key`
 * is a stable identifier unique within the order; `itemId` links a stockable line to an
 * {@link InventoryItem} (a receipt then posts stock), or is `null` for a non-stock purchase (a service,
 * a one-off). The line total is `quantity × unitPriceMinor`, exact.
 */
export interface OrderLine {
  readonly key: string;
  readonly itemId: Uuid | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly receivedQuantity: number;
}

export interface OrderLineInput {
  readonly key: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly itemId?: Uuid | null;
}

/** Normalize and validate an order-line input (positive integer quantity; non-negative unit price). */
export function makeOrderLine(input: OrderLineInput): OrderLine {
  const key = input.key.trim();
  if (key.length === 0) {
    throw new EmptyOrderLineKeyError();
  }
  const description = input.description.trim();
  if (description.length === 0) {
    throw new EmptyOrderLineDescriptionError();
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new InvalidQuantityError(input.quantity);
  }
  if (!Number.isInteger(input.unitPriceMinor)) {
    throw new InvalidMoneyError(input.unitPriceMinor);
  }
  if (input.unitPriceMinor < 0) {
    throw new NegativeAmountError(input.unitPriceMinor);
  }
  return {
    key,
    itemId: input.itemId ?? null,
    description,
    quantity: input.quantity,
    unitPriceMinor: input.unitPriceMinor,
    receivedQuantity: 0,
  };
}

/** The line's total (`quantity × unit price`) as {@link Money} in the given currency. */
export const orderLineTotal = (line: OrderLine, currency: string): Money =>
  money(line.quantity * line.unitPriceMinor, currency);

/** The still-outstanding quantity on the line (ordered − received). */
export const orderLineOutstanding = (line: OrderLine): number =>
  line.quantity - line.receivedQuantity;

/** Whether the line has been fully received. */
export const isOrderLineFullyReceived = (line: OrderLine): boolean =>
  line.receivedQuantity >= line.quantity;

/** Receive `quantity` against the line — raises `receivedQuantity`, rejecting over-receipt. */
export function receiveOnLine(line: OrderLine, quantity: number): OrderLine {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InvalidQuantityError(quantity);
  }
  const newReceived = line.receivedQuantity + quantity;
  if (newReceived > line.quantity) {
    throw new OverReceiptError(line.key, line.quantity, line.receivedQuantity, quantity);
  }
  return { ...line, receivedQuantity: newReceived };
}
