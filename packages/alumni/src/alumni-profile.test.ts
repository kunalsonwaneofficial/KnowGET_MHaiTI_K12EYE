import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  createAlumniProfile,
  isAlumniInNetwork,
  markAlumniLapsed,
  optOutAlumni,
  reactivateAlumni,
  updateAlumniProfile,
} from "./alumni-profile";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const alumnusPersonId = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = () =>
  createAlumniProfile({ tenantId, organizationId, alumnusPersonId, graduationYear: "2015" });

describe("AlumniProfile", () => {
  it("creates active, and runs active ↔ lapsed → opted_out", () => {
    let p = make();
    expect(p.status).toBe("active");
    expect(isAlumniInNetwork(p)).toBe(true);
    p = markAlumniLapsed(p);
    expect(p.status).toBe("lapsed");
    p = reactivateAlumni(p);
    expect(p.status).toBe("active");
    p = optOutAlumni(p);
    expect(p.status).toBe("opted_out");
    expect(isAlumniInNetwork(p)).toBe(false);
  });

  it("rejects an empty graduation year and updates while in-network only", () => {
    expect(() =>
      createAlumniProfile({ tenantId, organizationId, alumnusPersonId, graduationYear: " " }),
    ).toThrow(/graduation year/);
    const updated = updateAlumniProfile(make(), { program: "Physics" });
    expect(updated.program).toBe("Physics");
    expect(() => updateAlumniProfile(optOutAlumni(make()), { program: "X" })).toThrow(
      /cannot move/,
    );
  });

  it("guards invalid transitions", () => {
    expect(() => reactivateAlumni(make())).toThrow(/cannot move/); // active, not lapsed
    expect(() => markAlumniLapsed(optOutAlumni(make()))).toThrow(/cannot move/);
  });
});
