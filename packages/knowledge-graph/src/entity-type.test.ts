import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  activateEntityType,
  createEntityType,
  deprecateEntityType,
  describeEntityType,
  isEntityTypeUsable,
  normalizeTypeKey,
} from "./entity-type";
import {
  EmptyEntityTypeKeyError,
  EmptyEntityTypeLabelError,
  InvalidEntityTypeTransitionError,
} from "./errors";

const base = {
  tenantId: "t1" as TenantId,
  organizationId: "org1" as Uuid,
  key: "  Person ",
  label: "Person",
};

describe("EntityType aggregate", () => {
  it("normalizes the key (trim + lowercase) and starts draft", () => {
    const t = createEntityType(base);
    expect(t.key).toBe("person");
    expect(t.status).toBe("draft");
  });

  it("rejects an empty key or label", () => {
    expect(() => createEntityType({ ...base, key: "   " })).toThrow(EmptyEntityTypeKeyError);
    expect(() => createEntityType({ ...base, label: "  " })).toThrow(EmptyEntityTypeLabelError);
  });

  it("normalizeTypeKey lowercases and trims", () => {
    expect(normalizeTypeKey("  Enrolled_In ")).toBe("enrolled_in");
  });

  it("activates draft → active, then deprecates → deprecated", () => {
    const active = activateEntityType(createEntityType(base));
    expect(active.status).toBe("active");
    const dep = deprecateEntityType(active);
    expect(dep.status).toBe("deprecated");
    expect(isEntityTypeUsable(dep)).toBe(false);
  });

  it("cannot activate anything but a draft", () => {
    const active = activateEntityType(createEntityType(base));
    expect(() => activateEntityType(active)).toThrow(InvalidEntityTypeTransitionError);
  });

  it("cannot describe once deprecated", () => {
    const dep = deprecateEntityType(createEntityType(base));
    expect(() => describeEntityType(dep, { label: "X" })).toThrow(InvalidEntityTypeTransitionError);
  });

  it("describe updates label/description with trimming", () => {
    const t = describeEntityType(createEntityType(base), {
      label: " Alumnus ",
      description: " a graduate ",
    });
    expect(t.label).toBe("Alumnus");
    expect(t.description).toBe("a graduate");
  });
});
