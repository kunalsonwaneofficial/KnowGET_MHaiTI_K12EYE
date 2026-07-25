import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  abandonGoal,
  achieveGoal,
  activateGoal,
  draftGoal,
  isGoalAchieved,
  setGoalDescription,
} from "./development-goal";
import { EmptyGoalDescriptionError, InvalidGoalTransitionError } from "./errors";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = () =>
  draftGoal({
    tenantId: TENANT,
    organizationId: ORG,
    employeeId: EMPLOYEE,
    description: "Improve questioning technique",
    targetCompetencyKey: "ped-1",
  });

describe("draftGoal", () => {
  it("drafts a goal", () => {
    const g = make();
    expect(g.status).toBe("draft");
    expect(g.targetCompetencyKey).toBe("ped-1");
    expect(g.outcome).toBeNull();
  });

  it("rejects an empty description", () => {
    expect(() =>
      draftGoal({ tenantId: TENANT, organizationId: ORG, employeeId: EMPLOYEE, description: " " }),
    ).toThrow(EmptyGoalDescriptionError);
  });
});

describe("goal lifecycle", () => {
  it("activates then achieves with a recorded outcome", () => {
    const active = activateGoal(make());
    expect(active.status).toBe("active");
    const achieved = achieveGoal(active, "  Consistent use of wait time  ");
    expect(achieved.status).toBe("achieved");
    expect(achieved.outcome).toBe("Consistent use of wait time");
    expect(isGoalAchieved(achieved)).toBe(true);
  });

  it("abandons from draft or active, and forbids illegal transitions", () => {
    expect(abandonGoal(make(), "deprioritized").status).toBe("abandoned");
    const achieved = achieveGoal(activateGoal(make()));
    expect(() => activateGoal(achieved)).toThrow(InvalidGoalTransitionError);
    expect(() => setGoalDescription(achieved, "x")).toThrow(InvalidGoalTransitionError);
    expect(() => achieveGoal(make())).toThrow(InvalidGoalTransitionError); // draft → achieved not allowed
  });
});
