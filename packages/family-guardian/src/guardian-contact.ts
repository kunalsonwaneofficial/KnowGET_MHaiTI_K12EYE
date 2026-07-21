import type { CommunicationChannel } from "./communication-channel";

/**
 * A way to reach a guardian: a channel plus its value (an email address, phone number
 * or handle). A guardian may hold several; at most one is marked primary.
 */
export interface GuardianContact {
  readonly channel: CommunicationChannel;
  readonly value: string;
  readonly isPrimary: boolean;
}
