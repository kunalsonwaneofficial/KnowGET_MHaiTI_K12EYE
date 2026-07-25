import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { EmptySectionFieldError, InvalidCapacityError, SectionClosedError } from "./errors";
import {
  activateSection,
  closeSection,
  createSection,
  renameSection,
  setSectionCapacity,
} from "./section";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const CLASS = "33333333-3333-3333-3333-333333333333" as Uuid;

const section = () =>
  createSection({
    tenantId: TENANT,
    organizationId: ORG,
    classId: CLASS,
    name: " A ",
    capacity: 40,
  });

describe("section aggregate", () => {
  it("creates a planned section, trimming the name", () => {
    const s = section();
    expect(s.name).toBe("A");
    expect(s.capacity).toBe(40);
    expect(s.classId).toBe(CLASS);
    expect(s.status).toBe("planned");
  });

  it("rejects a blank name and an invalid capacity", () => {
    expect(() => createSection({ ...section(), name: " " })).toThrow(EmptySectionFieldError);
    expect(() => createSection({ ...section(), capacity: -1 })).toThrow(InvalidCapacityError);
    expect(() => createSection({ ...section(), capacity: 3.5 })).toThrow(InvalidCapacityError);
  });

  it("drives the planned → active → closed lifecycle and refuses changes once closed", () => {
    const active = activateSection(section());
    expect(active.status).toBe("active");
    const resized = setSectionCapacity(renameSection(active, "A1"), 45);
    expect(resized.name).toBe("A1");
    expect(resized.capacity).toBe(45);
    const closed = closeSection(resized);
    expect(closed.status).toBe("closed");
    expect(() => renameSection(closed, "A2")).toThrow(SectionClosedError);
    expect(() => setSectionCapacity(closed, 50)).toThrow(SectionClosedError);
    expect(() => closeSection(closed)).toThrow(SectionClosedError);
  });
});
