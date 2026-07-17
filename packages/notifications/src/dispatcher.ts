import { newUuid, nowIso } from "@knowget/shared";
import type { NotificationChannel } from "./channel";
import {
  type ChannelType,
  type Notification,
  type NotificationRequest,
  renderTemplate,
} from "./notification";

/** Raised when dispatching to a channel that has no registered transport. */
export class ChannelNotRegisteredError extends Error {
  constructor(channel: ChannelType) {
    super(`No transport registered for channel "${channel}"`);
    this.name = "ChannelNotRegisteredError";
  }
}

/**
 * Renders notification templates and routes them to the transport registered
 * for the requested channel. One dispatcher fans out across email/SMS/push/
 * in-app by delegating to the channel transports registered with it.
 */
export class NotificationDispatcher {
  private readonly channels = new Map<ChannelType, NotificationChannel>();

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.type, channel);
  }

  async dispatch(request: NotificationRequest): Promise<Notification> {
    const channel = this.channels.get(request.channel);
    if (!channel) {
      throw new ChannelNotRegisteredError(request.channel);
    }
    const data = request.data ?? {};
    const notification: Notification = {
      id: newUuid(),
      channel: request.channel,
      recipient: request.recipient,
      ...(request.template.subject !== undefined
        ? { subject: renderTemplate(request.template.subject, data) }
        : {}),
      body: renderTemplate(request.template.body, data),
      sentAt: nowIso(),
    };
    await channel.send(notification);
    return notification;
  }
}
