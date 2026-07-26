import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  addAudienceMembers,
  archiveAudience,
  audienceSize,
  createAudience,
  removeAudienceMembers,
  renameAudience,
} from "./audience";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const p = (n: number): Uuid => `33333333-3333-3333-3333-33333333333${n}` as Uuid;

const make = () =>
  createAudience({
    tenantId,
    organizationId,
    code: "AUD-1",
    name: "Grade 5 Parents",
    memberPersonIds: [p(1), p(2), p(2)],
  });

describe("Audience", () => {
  it("creates active, de-duplicating members", () => {
    const a = make();
    expect(a.status).toBe("active");
    expect(a.memberPersonIds).toEqual([p(1), p(2)]);
    expect(audienceSize(a)).toBe(2);
  });

  it("adds (de-duplicated) and removes members", () => {
    let a = make();
    a = addAudienceMembers(a, [p(2), p(3)]);
    expect(a.memberPersonIds).toEqual([p(1), p(2), p(3)]);
    a = removeAudienceMembers(a, [p(1)]);
    expect(a.memberPersonIds).toEqual([p(2), p(3)]);
  });

  it("freezes once archived (terminal)", () => {
    const a = archiveAudience(make());
    expect(a.status).toBe("archived");
    expect(() => renameAudience(a, "x")).toThrow(/cannot move/);
    expect(() => addAudienceMembers(a, [p(9)])).toThrow(/cannot move/);
    expect(() => archiveAudience(a)).toThrow(/cannot move/);
  });

  it("rejects an empty code or name", () => {
    expect(() => createAudience({ tenantId, organizationId, code: " ", name: "x" })).toThrow(
      /code/,
    );
    expect(() => createAudience({ tenantId, organizationId, code: "c", name: " " })).toThrow(
      /name/,
    );
  });
});
