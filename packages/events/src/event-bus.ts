import type { DomainEvent } from "@knowget/types";

/** A handler invoked when a matching event is published. */
export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => void | Promise<void>;

/** Handle returned by `subscribe`, used to stop receiving events. */
export interface Subscription {
  unsubscribe(): void;
}

/**
 * The event bus contract. This foundation is deliberately transport-agnostic:
 * P1-M05 hardens the in-memory implementation and P3-D02 introduces a
 * distributed streaming backbone behind this same interface.
 */
export interface EventBus {
  /** Publish an event to all subscribers of its `type`. */
  publish<E extends DomainEvent>(event: E): Promise<void>;
  /** Subscribe a handler to events of a given `type`. */
  subscribe<E extends DomainEvent>(type: E["type"], handler: EventHandler<E>): Subscription;
}
