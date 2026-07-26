import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  addThreadParticipant,
  archiveThread,
  closeThread,
  createMessageThread,
  isThreadOpen,
  isThreadParticipant,
  reopenThread,
} from "./message-thread";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid;
const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as Uuid;
const c = "cccccccc-cccc-cccc-cccc-cccccccccccc" as Uuid;

const make = () =>
  createMessageThread({
    tenantId,
    organizationId,
    subject: "Homework question",
    participantPersonIds: [a, b, b],
  });

describe("MessageThread", () => {
  it("opens with de-duplicated participants and requires at least two", () => {
    const t = make();
    expect(t.status).toBe("open");
    expect(t.participantPersonIds).toEqual([a, b]);
    expect(isThreadOpen(t)).toBe(true);
    expect(isThreadParticipant(t, a)).toBe(true);
    expect(() =>
      createMessageThread({ tenantId, organizationId, subject: "x", participantPersonIds: [a] }),
    ).toThrow(/at least two/);
  });

  it("adds a participant (idempotent) and runs open ↔ closed → archived", () => {
    let t = addThreadParticipant(make(), c);
    expect(t.participantPersonIds).toContain(c);
    t = addThreadParticipant(t, c);
    expect(t.participantPersonIds.filter((p) => p === c)).toHaveLength(1);
    t = closeThread(t);
    expect(t.status).toBe("closed");
    t = reopenThread(t);
    expect(t.status).toBe("open");
    t = archiveThread(t);
    expect(t.status).toBe("archived");
    expect(() => closeThread(t)).toThrow(/cannot move/);
    expect(() => addThreadParticipant(t, a)).toThrow(/cannot move/);
  });

  it("rejects an empty subject", () => {
    expect(() =>
      createMessageThread({
        tenantId,
        organizationId,
        subject: " ",
        participantPersonIds: [a, b],
      }),
    ).toThrow(/subject/);
  });
});
