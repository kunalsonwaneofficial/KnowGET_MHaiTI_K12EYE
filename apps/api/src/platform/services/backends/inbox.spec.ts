import type { Notification } from "@knowget/notifications";
import { nowIso } from "@knowget/shared";
import { describe, expect, it } from "vitest";
import { InMemoryInbox } from "./inbox";

const note = (id: string, recipient: string): Notification => ({
  id,
  channel: "in_app",
  recipient: { id: recipient },
  body: "hi",
  sentAt: nowIso(),
});

describe("InMemoryInbox", () => {
  it("delivers, lists, counts unread and marks read", async () => {
    const inbox = new InMemoryInbox();
    await inbox.send(note("n1", "alice"));
    await inbox.send(note("n2", "alice"));

    expect(await inbox.list("alice")).toHaveLength(2);
    expect(await inbox.unreadCount("alice")).toBe(2);
    expect(await inbox.markRead("alice", "n1")).toBe(true);
    expect(await inbox.unreadCount("alice")).toBe(1);
    expect(await inbox.markRead("alice", "nope")).toBe(false);
  });

  it("isolates recipients", async () => {
    const inbox = new InMemoryInbox();
    await inbox.send(note("n1", "alice"));
    expect(await inbox.list("bob")).toHaveLength(0);
  });
});
