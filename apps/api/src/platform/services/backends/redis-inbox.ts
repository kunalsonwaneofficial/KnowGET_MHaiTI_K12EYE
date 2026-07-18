import type { Notification } from "@knowget/notifications";
import type Redis from "ioredis";
import type { Inbox } from "./inbox";

/**
 * Redis-backed in-app inbox (TD-19): per-recipient notification lists shared
 * across replicas, so a notification delivered on one node is read on any other.
 * `markRead` is a read-modify-write on the stored entry (not atomic — acceptable
 * for an inbox's read flag).
 */
export class RedisInbox implements Inbox {
  readonly type = "in_app" as const;

  constructor(
    private readonly redis: Redis,
    private readonly ns = "inbox",
  ) {}

  async send(notification: Notification): Promise<void> {
    await this.redis.rpush(
      this.key(notification.recipient.id),
      JSON.stringify({ ...notification, read: false }),
    );
  }

  async list(recipientId: string): Promise<readonly Notification[]> {
    const raw = await this.redis.lrange(this.key(recipientId), 0, -1);
    return raw.map((entry) => JSON.parse(entry) as Notification);
  }

  async unreadCount(recipientId: string): Promise<number> {
    return (await this.list(recipientId)).filter((n) => n.read !== true).length;
  }

  async markRead(recipientId: string, notificationId: string): Promise<boolean> {
    const key = this.key(recipientId);
    const raw = await this.redis.lrange(key, 0, -1);
    const index = raw.findIndex(
      (entry) => (JSON.parse(entry) as Notification).id === notificationId,
    );
    if (index < 0) {
      return false;
    }
    const current = JSON.parse(raw[index] as string) as Notification;
    await this.redis.lset(key, index, JSON.stringify({ ...current, read: true }));
    return true;
  }

  private key(recipientId: string): string {
    return `${this.ns}:${recipientId}`;
  }
}
