import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { MessageService } from "./message-service";
import { closeThread, createMessageThread } from "./message-thread";
import { InMemoryMessageRepository, InMemoryMessageThreadRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid;
const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid;
const outsider = "cccccccc-cccc-cccc-cccc-cccccccccccc" as Uuid;

const setup = async (close = false) => {
  const repository = new InMemoryMessageRepository();
  const threads = new InMemoryMessageThreadRepository();
  const events: DomainEvent[] = [];
  let thread = createMessageThread({
    tenantId,
    organizationId,
    subject: "Question",
    participantPersonIds: [a, b],
  });
  if (close) {
    thread = closeThread(thread);
  }
  await threads.save(thread);
  const service = new MessageService({
    repository,
    threads,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, threads, service, thread, events };
};

describe("MessageService", () => {
  it("posts a message to an open thread by a participant, deriving org", async () => {
    const { service, thread, events } = await setup();
    const m = await service.post({
      tenantId,
      threadId: thread.id,
      authorPersonId: a,
      body: "Hi there",
      sentAt: "2026-07-01T10:00:00.000Z",
    });
    expect(m.organizationId).toBe(organizationId);
    expect(events.map((e) => e.type)).toContain("engagement.message.posted");
    expect(await service.countForThread(tenantId, thread.id)).toBe(1);
  });

  it("rejects a non-participant author and a closed thread", async () => {
    const { service, thread } = await setup();
    await expect(
      service.post({
        tenantId,
        threadId: thread.id,
        authorPersonId: outsider,
        body: "x",
        sentAt: "t",
      }),
    ).rejects.toThrow(/not a participant/);
    const { service: s2, thread: t2 } = await setup(true);
    await expect(
      s2.post({ tenantId, threadId: t2.id, authorPersonId: a, body: "x", sentAt: "t" }),
    ).rejects.toThrow(/not open/);
  });
});
