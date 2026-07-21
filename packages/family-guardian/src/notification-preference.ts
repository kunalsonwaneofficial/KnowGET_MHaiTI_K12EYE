/** How prominently a category of notification should be delivered to a family. */
export type NotificationLevel = "high" | "normal" | "low" | "muted";

/** A family's delivery preference for a category of notification. */
export interface NotificationPreference {
  readonly category: string;
  readonly level: NotificationLevel;
}
