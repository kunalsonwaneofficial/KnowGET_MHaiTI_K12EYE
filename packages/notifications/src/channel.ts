import type { ChannelType, Notification } from "./notification";

/**
 * A transport that delivers rendered notifications for one channel type. Phase-1
 * ships in-memory/recording transports; real providers (SES, Twilio, FCM) slot
 * in behind this same contract in later phases.
 */
export interface NotificationChannel {
  readonly type: ChannelType;
  send(notification: Notification): Promise<void>;
}

/**
 * A channel that records everything it is asked to send — useful as a test
 * double and as a default for channels without a real provider yet.
 */
export class RecordingChannel implements NotificationChannel {
  private readonly log: Notification[] = [];

  constructor(readonly type: ChannelType) {}

  async send(notification: Notification): Promise<void> {
    this.log.push(notification);
  }

  get sent(): readonly Notification[] {
    return this.log;
  }
}
