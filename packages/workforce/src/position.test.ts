import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyPositionCodeError,
  EmptyPositionTitleError,
  InvalidHeadcountError,
  InvalidPositionTransitionError,
} from "./errors";
import {
  closePosition,
  createPosition,
  holdPosition,
  isPositionOpen,
  openPosition,
  resumePosition,
  retitlePosition,
  setGrade,
  setHeadcount,
} from "./position";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const DEPT = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (code = "TEACH-MATH") =>
  createPosition({
    tenantId: TENANT,
    organizationId: ORG,
    departmentId: DEPT,
    code,
    title: "Mathematics Teacher",
    employmentType: "full_time",
  });

describe("createPosition", () => {
  it("creates a draft position, defaulting headcount to 1", () => {
    const pos = make();
    expect(pos.status).toBe("draft");
    expect(pos.headcount).toBe(1);
    expect(pos.employmentType).toBe("full_time");
    expect(pos.grade).toBeNull();
  });

  it("trims and validates code, title and headcount", () => {
    expect(() =>
      createPosition({
        tenantId: TENANT,
        organizationId: ORG,
        departmentId: DEPT,
        code: "  ",
        title: "X",
        employmentType: "full_time",
      }),
    ).toThrow(EmptyPositionCodeError);
    expect(() =>
      createPosition({
        tenantId: TENANT,
        organizationId: ORG,
        departmentId: DEPT,
        code: "C",
        title: "  ",
        employmentType: "full_time",
      }),
    ).toThrow(EmptyPositionTitleError);
    expect(() =>
      createPosition({
        tenantId: TENANT,
        organizationId: ORG,
        departmentId: DEPT,
        code: "C",
        title: "T",
        employmentType: "full_time",
        headcount: 0,
      }),
    ).toThrow(InvalidHeadcountError);
  });
});

describe("position mutations", () => {
  it("retitles, sets headcount and grade (no compensation amount)", () => {
    let pos = make();
    pos = retitlePosition(pos, "Senior Mathematics Teacher");
    pos = setHeadcount(pos, 5);
    pos = setGrade(pos, "PGT-III");
    expect(pos.title).toBe("Senior Mathematics Teacher");
    expect(pos.headcount).toBe(5);
    expect(pos.grade).toBe("PGT-III");
    expect(setGrade(pos, null).grade).toBeNull();
    expect(() => setHeadcount(pos, -1)).toThrow(InvalidHeadcountError);
    expect(() => setHeadcount(pos, 1.5)).toThrow(InvalidHeadcountError);
  });
});

describe("position lifecycle", () => {
  it("runs draft → open → on_hold → open → closed", () => {
    const draft = make();
    const open = openPosition(draft);
    expect(isPositionOpen(open)).toBe(true);
    const held = holdPosition(open);
    expect(held.status).toBe("on_hold");
    const resumed = resumePosition(held);
    expect(resumed.status).toBe("open");
    expect(closePosition(resumed).status).toBe("closed");
  });

  it("rejects illegal transitions", () => {
    const draft = make();
    expect(() => holdPosition(draft)).toThrow(InvalidPositionTransitionError);
    expect(() => resumePosition(draft)).toThrow(InvalidPositionTransitionError);
    const closed = closePosition(draft);
    expect(() => openPosition(closed)).toThrow(InvalidPositionTransitionError);
  });
});
