import { type Logger } from "@knowget/logging";
import type { DomainEvent } from "@knowget/types";
import type { EventBus, EventHandler, Subscription } from "./event-bus";

/**
 * In-process event bus with error isolation: a throwing handler never prevents
 * the other handlers from running, and failures are reported to the logger.
 * Suitable as the platform default until the distributed backbone (P3-D02).
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  constructor(private readonly logger?: Logger) {}

  subscribe<E extends DomainEvent>(type: E["type"], handler: EventHandler<E>): Subscription {
    const set = this.handlers.get(type) ?? new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.handlers.set(type, set);
    return {
      unsubscribe: () => {
        set.delete(handler as EventHandler);
        if (set.size === 0) {
          this.handlers.delete(type);
        }
      },
    };
  }

  async publish<E extends DomainEvent>(event: E): Promise<void> {
    const set = this.handlers.get(event.type);
    if (!set || set.size === 0) {
      return;
    }
    // Wrap each invocation so a synchronous throw becomes a rejected promise
    // (rather than escaping before Promise.allSettled can capture it).
    const results = await Promise.allSettled(
      [...set].map((handler) => Promise.resolve().then(() => handler(event))),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        this.logger?.error("Event handler failed", {
          eventType: event.type,
          eventId: event.metadata.eventId,
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  /** Number of handlers currently registered for a type (useful in tests). */
  handlerCount(type: string): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}
