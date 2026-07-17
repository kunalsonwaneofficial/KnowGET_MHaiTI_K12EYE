import type { Principal } from "@knowget/auth";
import type { Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { AuthorizationEngine, AuthorizationError } from "./engine";
import { policy } from "./model";
import { InMemoryRoleStore } from "./role-store";

const principal = (roles: string[], permissions: string[] = []): Principal => ({
  id: "00000000-0000-4000-8000-000000000000" as Uuid,
  roles,
  permissions,
});

const roles = new InMemoryRoleStore([
  { name: "teacher", permissions: ["student.read", "attendance.write"] },
  { name: "admin", permissions: ["*"] },
]);

describe("AuthorizationEngine", () => {
  it("grants via role permissions (RBAC)", () => {
    const engine = new AuthorizationEngine(roles);
    expect(
      engine.evaluate({ principal: principal(["teacher"]), action: "student.read" }).allowed,
    ).toBe(true);
    expect(
      engine.evaluate({ principal: principal(["teacher"]), action: "finance.read" }).allowed,
    ).toBe(false);
  });

  it("honors the wildcard role", () => {
    const engine = new AuthorizationEngine(roles);
    expect(engine.evaluate({ principal: principal(["admin"]), action: "anything" }).allowed).toBe(
      true,
    );
  });

  it("lets an explicit deny policy override an RBAC grant", () => {
    const denyArchived = policy("deny-archived", "deny", (ctx) => ctx.attributes.archived === true);
    const engine = new AuthorizationEngine(roles, [denyArchived]);
    const decision = engine.evaluate({
      principal: principal(["admin"]),
      action: "student.read",
      attributes: { archived: true },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("deny-archived");
  });

  it("grants via an ABAC allow policy condition", () => {
    const ownerCanRead = policy(
      "owner-read",
      "allow",
      (ctx) => ctx.action === "doc.read" && ctx.attributes.ownerId === ctx.principal.id,
    );
    const engine = new AuthorizationEngine(roles, [ownerCanRead]);
    const p = principal([]);
    expect(
      engine.evaluate({ principal: p, action: "doc.read", attributes: { ownerId: p.id } }).allowed,
    ).toBe(true);
    expect(
      engine.evaluate({ principal: p, action: "doc.read", attributes: { ownerId: "other" } })
        .allowed,
    ).toBe(false);
  });

  it("throws AuthorizationError from assert when denied", () => {
    const engine = new AuthorizationEngine(roles);
    expect(() => engine.assert({ principal: principal([]), action: "x" })).toThrow(
      AuthorizationError,
    );
  });
});
