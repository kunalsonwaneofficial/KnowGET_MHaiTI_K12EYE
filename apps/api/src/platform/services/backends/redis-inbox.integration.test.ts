import type { Notification } from "@knowget/notifications";
import { nowIso } from "@knowget/shared";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisInbox } from "./redis-inbox";

const url = process.env.REDIS_URL;

const note = (id: string, recipient: string): Notification => ({
  id,
  channel: "in_app",
  recipient: { id: recipient },
  body: "hi",
  sentAt: nowIso(),
});

describe.skipIf(!url)("RedisInbox (integration)", () => {
  let redis: Redis;
  const ns = `inbox-test:${process.pid}`;

  beforeAll(() => {
    redis = new Redis(url as string);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${ns}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it("delivers and reads back across instances", async () => {
    const a = new RedisInbox(redis, ns);
    const b = new RedisInbox(redis, ns); // another replica on the same Redis
    await a.send(note("n1", "alice"));
    await a.send(note("n2", "alice"));

    expect(await b.list("alice")).toHaveLength(2); // shared inbox
    expect(await b.unreadCount("alice")).toBe(2);
    expect(await b.markRead("alice", "n1")).toBe(true);
    expect(await a.unreadCount("alice")).toBe(1); // the read is seen by the other instance
  });
});
