import type { ISODateString } from "@knowget/types";

/** Delivery channels supported by the platform. */
export type ChannelType = "email" | "sms" | "push" | "in_app";

export interface Recipient {
  readonly id: string;
  /** Channel-specific address (email address, phone number, device token, …). */
  readonly address?: string;
}

/** A subject/body template with `{placeholder}` slots. */
export interface NotificationTemplate {
  readonly subject?: string;
  readonly body: string;
}

/** A request to notify one recipient over one channel. */
export interface NotificationRequest {
  readonly channel: ChannelType;
  readonly recipient: Recipient;
  readonly template: NotificationTemplate;
  readonly data?: Readonly<Record<string, string | number>>;
}

/** A rendered, dispatched notification. */
export interface Notification {
  readonly id: string;
  readonly channel: ChannelType;
  readonly recipient: Recipient;
  readonly subject?: string;
  readonly body: string;
  readonly sentAt: ISODateString;
  read?: boolean;
}

/** Substitute `{name}` slots; unknown slots are left untouched. */
export function renderTemplate(
  template: string,
  data: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in data ? String(data[name]) : match,
  );
}
