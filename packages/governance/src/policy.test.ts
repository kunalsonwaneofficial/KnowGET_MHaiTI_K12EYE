import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyPolicyTitleError, InvalidPolicyTransitionError } from "./errors";
import {
  acknowledge,
  amendPolicy,
  approvePolicy,
  authorPolicy,
  isInForce,
  publishPolicy,
  retirePolicy,
  updateDraft,
} from "./policy";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const OWNER = "33333333-3333-3333-3333-333333333333" as Uuid;
const PERSON = "44444444-4444-4444-4444-444444444444" as Uuid;

const draft = () =>
  authorPolicy({
    tenantId: TENANT,
    organizationId: ORG,
    category: "attendance",
    title: "  Attendance Policy  ",
    ownerId: OWNER,
  });

describe("Policy", () => {
  it("authors a draft at version 1, trimming the title", () => {
    const policy = draft();
    expect(policy.title).toBe("Attendance Policy");
    expect(policy.status).toBe("draft");
    expect(policy.version).toBe(1);
  });

  it("rejects an empty title on author and update", () => {
    expect(() =>
      authorPolicy({
        tenantId: TENANT,
        organizationId: ORG,
        category: "other",
        title: "  ",
        ownerId: OWNER,
      }),
    ).toThrow(EmptyPolicyTitleError);
    expect(() => updateDraft(draft(), { title: " " })).toThrow(EmptyPolicyTitleError);
  });

  it("runs the lifecycle draft → approved → published", () => {
    const published = publishPolicy(approvePolicy(draft(), "2026-07-01"), {
      effectiveOn: "2026-08-01",
      publishedOn: "2026-07-10",
    });
    expect(published.status).toBe("published");
    expect(published.effectiveOn).toBe("2026-08-01");
    expect(isInForce(published)).toBe(true);
  });

  it("enforces transition order", () => {
    expect(() => publishPolicy(draft())).toThrow(InvalidPolicyTransitionError); // not approved
    expect(() => retirePolicy(draft())).toThrow(InvalidPolicyTransitionError); // not published
  });

  it("amends a published policy into a new draft version", () => {
    const published = publishPolicy(approvePolicy(draft()));
    const amended = amendPolicy(published);
    expect(amended.status).toBe("draft");
    expect(amended.version).toBe(2);
    expect(amended.approvedOn).toBeNull();
  });

  it("retires a published policy", () => {
    const retired = retirePolicy(publishPolicy(approvePolicy(draft())), "2026-12-31");
    expect(retired.status).toBe("retired");
    expect(retired.retiredOn).toBe("2026-12-31");
  });

  it("acknowledges the current version", () => {
    const published = publishPolicy(approvePolicy(draft()));
    const ack = acknowledge(published, PERSON);
    expect(ack).toMatchObject({ policyId: published.id, personId: PERSON, version: 1 });
  });
});
