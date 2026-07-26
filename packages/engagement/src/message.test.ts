import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { postMessage } from "./message";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const threadId = "88888888-8888-8888-8888-888888888888" as Uuid;
const authorPersonId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as Uuid;

describe("Message", () => {
  it("posts an immutable message with a trimmed body", () => {
    const m = postMessage({
      tenantId,
      organizationId,
      threadId,
      authorPersonId,
      body: "  Hello  ",
      sentAt: "2026-07-01T10:00:00.000Z",
    });
    expect(m.body).toBe("Hello");
    expect(m.threadId).toBe(threadId);
    expect(m.sentAt).toBe("2026-07-01T10:00:00.000Z");
  });

  it("rejects an empty body", () => {
    expect(() =>
      postMessage({ tenantId, organizationId, threadId, authorPersonId, body: " ", sentAt: "t" }),
    ).toThrow(/body/);
  });
});
