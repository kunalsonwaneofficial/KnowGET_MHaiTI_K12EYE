import { InAppInbox, type Notification, type NotificationChannel } from "@knowget/notifications";

/**
 * Async in-app inbox. The in-memory adapter wraps the frozen `InAppInbox`
 * (per-instance); the Redis adapter makes the inbox **shared across replicas**
 * (TD-19). Async because the frozen inbox's read methods are synchronous. Extends
 * `NotificationChannel` so the dispatcher can route the `in_app` channel to it.
 */
export interface Inbox extends NotificationChannel {
  list(recipientId: string): Promise<readonly Notification[]>;
  unreadCount(recipientId: string): Promise<number>;
  markRead(recipientId: string, notificationId: string): Promise<boolean>;
}

/** In-memory {@link Inbox} — wraps the frozen `InAppInbox` behind the async port. */
export class InMemoryInbox implements Inbox {
  readonly type = "in_app" as const;

  constructor(private readonly inbox: InAppInbox = new InAppInbox()) {}

  send(notification: Notification): Promise<void> {
    return this.inbox.send(notification);
  }

  async list(recipientId: string): Promise<readonly Notification[]> {
    return this.inbox.list(recipientId);
  }

  async unreadCount(recipientId: string): Promise<number> {
    return this.inbox.unreadCount(recipientId);
  }

  async markRead(recipientId: string, notificationId: string): Promise<boolean> {
    return this.inbox.markRead(recipientId, notificationId);
  }
}
