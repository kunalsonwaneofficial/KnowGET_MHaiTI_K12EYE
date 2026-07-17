import { describe, expect, it } from "vitest";
import { RecordingChannel } from "./channel";
import { ChannelNotRegisteredError, NotificationDispatcher } from "./dispatcher";
import { InAppInbox } from "./in-app-inbox";
import { renderTemplate } from "./notification";

describe("renderTemplate", () => {
  it("interpolates data into subject/body slots", () => {
    expect(renderTemplate("Hi {name}, due {amount}", { name: "Kunal", amount: 500 })).toBe(
      "Hi Kunal, due 500",
    );
  });
});

describe("NotificationDispatcher", () => {
  it("renders and delivers over the requested channel", async () => {
    const dispatcher = new NotificationDispatcher();
    const email = new RecordingChannel("email");
    dispatcher.registerChannel(email);

    const notification = await dispatcher.dispatch({
      channel: "email",
      recipient: { id: "u1", address: "u1@example.com" },
      template: { subject: "Welcome {name}", body: "Hello {name}!" },
      data: { name: "Ada" },
    });

    expect(notification.subject).toBe("Welcome Ada");
    expect(notification.body).toBe("Hello Ada!");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.id).toBe(notification.id);
  });

  it("throws when no transport is registered for the channel", async () => {
    const dispatcher = new NotificationDispatcher();
    await expect(
      dispatcher.dispatch({
        channel: "sms",
        recipient: { id: "u1" },
        template: { body: "hi" },
      }),
    ).rejects.toBeInstanceOf(ChannelNotRegisteredError);
  });
});

describe("InAppInbox", () => {
  it("stores notifications per recipient and tracks read state", async () => {
    const dispatcher = new NotificationDispatcher();
    const inbox = new InAppInbox();
    dispatcher.registerChannel(inbox);

    const n = await dispatcher.dispatch({
      channel: "in_app",
      recipient: { id: "u1" },
      template: { body: "You have a new message" },
    });
    await dispatcher.dispatch({
      channel: "in_app",
      recipient: { id: "u2" },
      template: { body: "Other recipient" },
    });

    expect(inbox.list("u1")).toHaveLength(1);
    expect(inbox.unreadCount("u1")).toBe(1);
    expect(inbox.markRead("u1", n.id)).toBe(true);
    expect(inbox.unreadCount("u1")).toBe(0);
    expect(inbox.markRead("u1", "missing")).toBe(false);
  });
});
