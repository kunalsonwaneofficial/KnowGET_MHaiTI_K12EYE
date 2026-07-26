import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  archiveCycle,
  closeCycle,
  createAdmissionCycle,
  gradeCapacityOf,
  isCycleOpen,
  openCycle,
  setCycleGradeCapacities,
} from "./admission-cycle";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  createAdmissionCycle({
    tenantId,
    organizationId,
    code: "CYC-27",
    name: "2027-28 Primary Intake",
    academicYear: "2027-28",
    gradeCapacities: [
      { grade: "G1", capacity: 40 },
      { grade: "G2", capacity: 30 },
    ],
  });

describe("AdmissionCycle", () => {
  it("creates planning with a validated seat plan and runs planning → open → closed → archived", () => {
    let c = make();
    expect(c.status).toBe("planning");
    expect(gradeCapacityOf(c, "G1")).toBe(40);
    expect(gradeCapacityOf(c, "G9")).toBe(0);
    c = openCycle(c);
    expect(isCycleOpen(c)).toBe(true);
    c = closeCycle(c);
    expect(c.status).toBe("closed");
    // the seat plan is frozen once closed
    expect(() => setCycleGradeCapacities(c, [{ grade: "G1", capacity: 50 }])).toThrow(
      /cannot move/,
    );
    c = archiveCycle(c);
    expect(c.status).toBe("archived");
  });

  it("rejects a duplicate grade or a negative capacity", () => {
    expect(() =>
      createAdmissionCycle({
        tenantId,
        organizationId,
        code: "C2",
        name: "n",
        academicYear: "2027",
        gradeCapacities: [
          { grade: "G1", capacity: 10 },
          { grade: "G1", capacity: 20 },
        ],
      }),
    ).toThrow(/capacity/);
    expect(() =>
      createAdmissionCycle({
        tenantId,
        organizationId,
        code: "C3",
        name: "n",
        academicYear: "2027",
        gradeCapacities: [{ grade: "G1", capacity: -5 }],
      }),
    ).toThrow(/capacity/);
  });
});
