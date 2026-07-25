import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptySupplierCodeError,
  EmptySupplierNameError,
  InvalidSupplierTransitionError,
} from "./errors";
import {
  blacklistSupplier,
  createSupplier,
  isSupplierActive,
  reinstateSupplier,
  renameSupplier,
  setSupplierContact,
  suspendSupplier,
} from "./supplier";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;

const base = {
  tenantId: TENANT,
  organizationId: ORG,
  code: "ACME",
  name: "Acme Supplies",
} as const;
const create = () => createSupplier(base);

describe("supplier", () => {
  it("registers active and runs active ↔ suspended, → blacklisted", () => {
    const s = create();
    expect(s.status).toBe("active");
    expect(isSupplierActive(s)).toBe(true);

    const suspended = suspendSupplier(s);
    expect(suspended.status).toBe("suspended");
    expect(reinstateSupplier(suspended).status).toBe("active");
    expect(blacklistSupplier(s).status).toBe("blacklisted");
    expect(blacklistSupplier(suspended).status).toBe("blacklisted");
  });

  it("rejects invalid transitions and empty code/name", () => {
    expect(() => reinstateSupplier(create())).toThrow(InvalidSupplierTransitionError);
    expect(() => blacklistSupplier(blacklistSupplier(create()))).toThrow(
      InvalidSupplierTransitionError,
    );
    expect(() => createSupplier({ ...base, code: " " })).toThrow(EmptySupplierCodeError);
    expect(() => createSupplier({ ...base, name: " " })).toThrow(EmptySupplierNameError);
  });

  it("edits name and contact", () => {
    expect(renameSupplier(create(), "New Name").name).toBe("New Name");
    const c = setSupplierContact(create(), "sales@acme.test", "+91-99999");
    expect(c.contactEmail).toBe("sales@acme.test");
    expect(c.contactPhone).toBe("+91-99999");
    expect(setSupplierContact(c, null, null).contactEmail).toBeNull();
  });
});
