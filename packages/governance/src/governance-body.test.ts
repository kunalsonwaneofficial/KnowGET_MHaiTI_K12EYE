import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptyGovernanceBodyNameError, InvalidGovernanceBodyTransitionError } from "./errors";
import {
  createGovernanceBody,
  dissolveGovernanceBody,
  isActiveGovernanceBody,
  renameGovernanceBody,
  reviseTermsOfReference,
} from "./governance-body";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  createGovernanceBody({
    tenantId: TENANT,
    organizationId: ORG,
    name: "  Board of Trustees  ",
    type: "board_of_trustees",
  });

describe("GovernanceBody", () => {
  it("creates an active body, trimming the name", () => {
    const body = make();
    expect(body.name).toBe("Board of Trustees");
    expect(body.type).toBe("board_of_trustees");
    expect(body.status).toBe("active");
    expect(isActiveGovernanceBody(body)).toBe(true);
    expect(body.parentBodyId).toBeNull();
    expect(body.dissolvedOn).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(() =>
      createGovernanceBody({ tenantId: TENANT, organizationId: ORG, name: "   ", type: "other" }),
    ).toThrow(EmptyGovernanceBodyNameError);
  });

  it("nests under a parent body and normalizes terms of reference", () => {
    const parentId = "33333333-3333-3333-3333-333333333333" as Uuid;
    const body = createGovernanceBody({
      tenantId: TENANT,
      organizationId: ORG,
      name: "Finance Committee",
      type: "finance_committee",
      parentBodyId: parentId,
      termsOfReference: "  Oversee institutional finances  ",
    });
    expect(body.parentBodyId).toBe(parentId);
    expect(body.termsOfReference).toBe("Oversee institutional finances");
  });

  it("dissolves an active body and blocks a second dissolution", () => {
    const dissolved = dissolveGovernanceBody(make(), "2026-07-18");
    expect(dissolved.status).toBe("dissolved");
    expect(dissolved.dissolvedOn).toBe("2026-07-18");
    expect(isActiveGovernanceBody(dissolved)).toBe(false);
    expect(() => dissolveGovernanceBody(dissolved)).toThrow(InvalidGovernanceBodyTransitionError);
  });

  it("renames (rejecting empty) and clears terms of reference", () => {
    const renamed = renameGovernanceBody(make(), "Governing Council");
    expect(renamed.name).toBe("Governing Council");
    expect(() => renameGovernanceBody(renamed, "  ")).toThrow(EmptyGovernanceBodyNameError);
    expect(reviseTermsOfReference(renamed, "   ").termsOfReference).toBeNull();
  });
});
