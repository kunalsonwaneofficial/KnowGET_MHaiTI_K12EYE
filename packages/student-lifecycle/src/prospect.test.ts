import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyFollowUpNoteError, InvalidProspectTransitionError } from "./errors";
import {
  contactProspect,
  convertProspect,
  createProspect,
  isActive,
  loseProspect,
  type Prospect,
  qualifyProspect,
  recordFollowUp,
} from "./prospect";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const PERSON = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (): Prospect =>
  createProspect({
    tenantId: TENANT,
    organizationId: ORG,
    personId: PERSON,
    leadSource: "website",
    interests: ["grade-1"],
  });

describe("prospect", () => {
  it("captures a new enquiry", () => {
    const p = make();
    expect(p.status).toBe("new");
    expect(p.personId).toBe(PERSON);
    expect(p.interests).toEqual(["grade-1"]);
    expect(p.followUps).toHaveLength(0);
    expect(isActive(p)).toBe(true);
  });

  it("records follow-ups and rejects empty notes", () => {
    const p = recordFollowUp(make(), "  Called parent  ");
    expect(p.followUps).toHaveLength(1);
    expect(p.followUps[0]?.note).toBe("Called parent");
    expect(() => recordFollowUp(p, "   ")).toThrow(EmptyFollowUpNoteError);
  });

  it("walks the funnel new → contacted → qualified → converted", () => {
    const converted = convertProspect(qualifyProspect(contactProspect(make())));
    expect(converted.status).toBe("converted");
    expect(isActive(converted)).toBe(false);
  });

  it("can be lost while active, and rejects illegal transitions", () => {
    expect(loseProspect(make()).status).toBe("lost");
    expect(() => convertProspect(make())).toThrow(InvalidProspectTransitionError);
    expect(() => recordFollowUp(loseProspect(make()), "note")).toThrow(
      InvalidProspectTransitionError,
    );
  });
});
