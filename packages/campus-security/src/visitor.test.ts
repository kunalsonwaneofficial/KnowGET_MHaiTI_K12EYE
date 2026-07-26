import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  archiveVisitor,
  blockVisitor,
  isVisitorActive,
  registerVisitor,
  setVisitorType,
  unblockVisitor,
  updateVisitorContact,
} from "./visitor";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  registerVisitor({
    tenantId,
    organizationId,
    code: "V-1",
    fullName: "Asha Rao",
    type: "vendor",
  });

describe("Visitor aggregate", () => {
  it("registers active with a trimmed code/name and normalized contact", () => {
    const v = registerVisitor({
      tenantId,
      organizationId,
      code: "  V-1 ",
      fullName: "  Asha Rao ",
      type: "vendor",
      phone: "  ",
      email: "asha@example.com",
    });
    expect(v.code).toBe("V-1");
    expect(v.fullName).toBe("Asha Rao");
    expect(v.phone).toBeNull(); // blank normalized to null
    expect(v.email).toBe("asha@example.com");
    expect(v.company).toBeNull();
    expect(isVisitorActive(v)).toBe(true);
    expect(() =>
      registerVisitor({ tenantId, organizationId, code: " ", fullName: "X", type: "guest" }),
    ).toThrow(/code/);
    expect(() =>
      registerVisitor({ tenantId, organizationId, code: "V", fullName: " ", type: "guest" }),
    ).toThrow(/name/);
  });

  it("edits type and contact and runs active ↔ blocked → archived with guards", () => {
    const v = make();
    expect(setVisitorType(v, "contractor").type).toBe("contractor");
    expect(updateVisitorContact(v, { company: "Acme" }).company).toBe("Acme");
    const blocked = blockVisitor(v);
    expect(blocked.status).toBe("blocked");
    expect(isVisitorActive(blocked)).toBe(false);
    expect(unblockVisitor(blocked).status).toBe("active");
    expect(() => unblockVisitor(v)).toThrow(/cannot move/); // active, not blocked
    expect(() => blockVisitor(blocked)).toThrow(/cannot move/); // already blocked
    const archived = archiveVisitor(v);
    expect(archived.status).toBe("archived");
    expect(() => archiveVisitor(archived)).toThrow(/cannot move/); // terminal
    expect(() => setVisitorType(archived, "guest")).toThrow(/cannot move/); // frozen once archived
  });
});
