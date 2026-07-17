import type { NotificationChannel } from "./channel";
import type { Notification } from "./notification";

/**
 * The `in_app` channel: instead of an external transport it persists
 * notifications to a per-recipient inbox that the application can read back,
 * mark read, and count. In-memory here; a persistence-backed inbox replaces it
 * in Phase 2.
 */
export class InAppInbox implements NotificationChannel {
  readonly type = "in_app" as const;
  private readonly byRecipient = new Map<string, Notification[]>();

  async send(notification: Notification): Promise<void> {
    const list = this.byRecipient.get(notification.recipient.id) ?? [];
    list.push({ ...notification, read: false });
    this.byRecipient.set(notification.recipient.id, list);
  }

  list(recipientId: string): readonly Notification[] {
    return this.byRecipient.get(recipientId) ?? [];
  }

  unreadCount(recipientId: string): number {
    return this.list(recipientId).filter((n) => n.read !== true).length;
  }

  markRead(recipientId: string, notificationId: string): boolean {
    const target = this.byRecipient.get(recipientId)?.find((n) => n.id === notificationId);
    if (!target) {
      return false;
    }
    target.read = true;
    return true;
  }
}
