import { createHash } from "node:crypto";
import { nowIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";

export type SecurityEventType =
  | "authentication.succeeded"
  | "authentication.failed"
  | "authorization.denied"
  | "password.changed"
  | "session.created"
  | "session.revoked"
  | "token.issued"
  | "token.revoked"
  | "account.locked"
  | "security.config.changed";

export interface SecurityEventInput {
  readonly type: SecurityEventType;
  readonly actorId?: string;
  readonly tenantId?: string;
  readonly correlationId?: string;
  readonly detail?: Record<string, unknown>;
}

export interface SecurityEvent extends SecurityEventInput {
  readonly sequence: number;
  readonly occurredAt: ISODateString;
  readonly previousHash: string;
  readonly hash: string;
}

export type SecurityEventSink = (event: SecurityEvent) => void;

const GENESIS_HASH = "0".repeat(64);

function chainHash(fields: Omit<SecurityEvent, "hash">): string {
  // Canonical serialization (fixed key order, nulls for absent) → deterministic.
  const body = JSON.stringify({
    sequence: fields.sequence,
    occurredAt: fields.occurredAt,
    type: fields.type,
    actorId: fields.actorId ?? null,
    tenantId: fields.tenantId ?? null,
    correlationId: fields.correlationId ?? null,
    detail: fields.detail ?? null,
    previousHash: fields.previousHash,
  });
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Tamper-evident security audit log: each record's hash chains to the previous
 * one, so any modification or deletion breaks the chain and is detectable.
 */
export class SecurityAuditLogger {
  private sequence = 0;
  private previousHash = GENESIS_HASH;
  private readonly events: SecurityEvent[] = [];

  constructor(private readonly sink?: SecurityEventSink) {}

  record(input: SecurityEventInput): SecurityEvent {
    const base = {
      ...input,
      sequence: ++this.sequence,
      occurredAt: nowIso(),
      previousHash: this.previousHash,
    };
    const hash = chainHash(base);
    const event: SecurityEvent = { ...base, hash };
    this.previousHash = hash;
    this.events.push(event);
    this.sink?.(event);
    return event;
  }

  /** Recompute the chain and confirm no record was altered or removed. */
  verifyChain(): boolean {
    let previousHash = GENESIS_HASH;
    for (const event of this.events) {
      if (event.previousHash !== previousHash) {
        return false;
      }
      const { hash, ...rest } = event;
      if (chainHash({ ...rest, previousHash }) !== hash) {
        return false;
      }
      previousHash = event.hash;
    }
    return true;
  }

  all(): readonly SecurityEvent[] {
    return this.events;
  }
}
