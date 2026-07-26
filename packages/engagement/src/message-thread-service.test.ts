import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { MessageThreadService } from "./message-thread-service";
import type { OrganizationDirectory, PersonDirectory } from "./ports";
import { InMemoryMessageThreadRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid;
const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid;
const c = "cccccccc-cccc-cccc-cccc-cccccccccccc" as Uuid;

const known = new Set<string>([a, b, c]);
const organizations: OrganizationDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return id === organizationId;
  },
};
const persons: PersonDirectory = {
  async exists(_t: TenantId, id: Uuid) {
    return known.has(id);
  },
};

const setup = () => {
  const repository = new InMemoryMessageThreadRepository();
  const events: DomainEvent[] = [];
  const service = new MessageThreadService({
    repository,
    organizations,
    persons,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, service, events };
};

describe("MessageThreadService", () => {
  it("opens a thread validating the org and every participant, and adds a participant", async () => {
    const { service, events } = setup();
    const t = await service.open({
      tenantId,
      organizationId,
      subject: "Field trip",
      participantPersonIds: [a, b],
    });
    expect(t.status).toBe("open");
    await service.addParticipant(tenantId, t.id, c);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("engagement.thread.opened")).toBe(true);
    expect(types.has("engagement.thread.participant_added")).toBe(true);
  });

  it("rejects an unknown organization or an unknown participant", async () => {
    const { service } = setup();
    await expect(
      service.open({
        tenantId,
        organizationId: "missing" as Uuid,
        subject: "x",
        participantPersonIds: [a, b],
      }),
    ).rejects.toThrow(/Organization/);
    await expect(
      service.open({
        tenantId,
        organizationId,
        subject: "x",
        participantPersonIds: [a, "ghost" as Uuid],
      }),
    ).rejects.toThrow(/Person/);
  });

  it("drives close → reopen → archive", async () => {
    const { service, events } = setup();
    const t = await service.open({
      tenantId,
      organizationId,
      subject: "Fees",
      participantPersonIds: [a, b],
    });
    await service.close(tenantId, t.id);
    await service.reopen(tenantId, t.id);
    await service.archive(tenantId, t.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("engagement.thread.closed")).toBe(true);
    expect(types.has("engagement.thread.reopened")).toBe(true);
    expect(types.has("engagement.thread.archived")).toBe(true);
  });
});
