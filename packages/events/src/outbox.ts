import { newUuid, nowIso } from "@knowget/shared";
import type { DomainEvent, ISODateString } from "@knowget/types";
import type { EventBus } from "./event-bus";

/** A durably-recorded event awaiting publication. */
export interface OutboxRecord {
  readonly id: string;
  readonly event: DomainEvent;
  readonly createdAt: ISODateString;
  readonly processedAt: ISODateString | null;
  readonly attempts: number;
}

/**
 * Storage for the transactional outbox. In a real deployment an event is
 * written here in the *same database transaction* as the business change, so
 * the two commit atomically; a relay then publishes it. Phase-1 ships the
 * in-memory store; a PostgreSQL-backed store implements this same contract.
 */
export interface OutboxStore {
  enqueue(event: DomainEvent): Promise<OutboxRecord>;
  /** Unprocessed records, oldest first, up to `limit`. */
  pending(limit?: number): Promise<readonly OutboxRecord[]>;
  markProcessed(id: string): Promise<void>;
  /** Record a failed publication attempt (leaves the record pending for retry). */
  markFailed(id: string): Promise<void>;
}

export class InMemoryOutbox implements OutboxStore {
  private readonly records = new Map<string, OutboxRecord>();

  async enqueue(event: DomainEvent): Promise<OutboxRecord> {
    const record: OutboxRecord = {
      id: newUuid(),
      event,
      createdAt: nowIso(),
      processedAt: null,
      attempts: 0,
    };
    this.records.set(record.id, record);
    return record;
  }

  async pending(limit?: number): Promise<readonly OutboxRecord[]> {
    const pending = [...this.records.values()].filter((r) => r.processedAt === null);
    return limit !== undefined ? pending.slice(0, limit) : pending;
  }

  async markProcessed(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, processedAt: nowIso() });
    }
  }

  async markFailed(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, attempts: record.attempts + 1 });
    }
  }
}

export interface RelaySummary {
  readonly published: number;
  readonly failed: number;
}

/**
 * Drains the outbox to the {@link EventBus}. Delivery is at-least-once: a record
 * is marked processed only after a successful publish, so a crash between
 * publishing and marking simply republishes on the next pass. Consumers must be
 * idempotent (keyed on `metadata.eventId`).
 */
export class OutboxRelay {
  constructor(
    private readonly store: OutboxStore,
    private readonly bus: EventBus,
  ) {}

  async relayOnce(batchSize = 100): Promise<RelaySummary> {
    const pending = await this.store.pending(batchSize);
    let published = 0;
    let failed = 0;
    for (const record of pending) {
      try {
        await this.bus.publish(record.event);
        await this.store.markProcessed(record.id);
        published += 1;
      } catch {
        await this.store.markFailed(record.id);
        failed += 1;
      }
    }
    return { published, failed };
  }
}
