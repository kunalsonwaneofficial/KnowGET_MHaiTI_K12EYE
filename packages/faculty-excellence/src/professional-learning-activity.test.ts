import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyActivityTitleError,
  InvalidActivityHoursError,
  InvalidActivityTransitionError,
} from "./errors";
import {
  cancelActivity,
  completeActivity,
  enrollActivity,
  isActivityCompleted,
  planActivity,
  setActivityHours,
} from "./professional-learning-activity";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = (hours = 6) =>
  planActivity({
    tenantId: TENANT,
    organizationId: ORG,
    employeeId: EMPLOYEE,
    title: "Formative assessment workshop",
    category: "assessment",
    hours,
    provider: "  Institute of Education  ",
    startDate: "2026-04-01",
  });

describe("planActivity", () => {
  it("plans an activity, deriving the period from the start date and trimming the provider", () => {
    const a = make();
    expect(a.status).toBe("planned");
    expect(a.period).toBe("2026");
    expect(a.provider).toBe("Institute of Education");
    expect(a.completedOn).toBeNull();
  });

  it("rejects an empty title or non-positive hours", () => {
    expect(() =>
      planActivity({
        tenantId: TENANT,
        organizationId: ORG,
        employeeId: EMPLOYEE,
        title: "  ",
        category: "pedagogy",
        hours: 2,
      }),
    ).toThrow(EmptyActivityTitleError);
    expect(() => make(0)).toThrow(InvalidActivityHoursError);
  });
});

describe("activity lifecycle", () => {
  it("runs planned → enrolled → completed, stamping the completion date", () => {
    const enrolled = enrollActivity(make());
    expect(enrolled.status).toBe("enrolled");
    const withHours = setActivityHours(enrolled, 8);
    expect(withHours.hours).toBe(8);
    const completed = completeActivity(withHours, "2026-05-20");
    expect(completed.status).toBe("completed");
    expect(completed.completedOn).toBe("2026-05-20");
    expect(isActivityCompleted(completed)).toBe(true);
  });

  it("cancels from planned or enrolled and forbids illegal transitions", () => {
    expect(cancelActivity(make()).status).toBe("cancelled");
    const completed = completeActivity(make());
    expect(() => enrollActivity(completed)).toThrow(InvalidActivityTransitionError);
    expect(() => setActivityHours(completed, 3)).toThrow(InvalidActivityTransitionError);
    expect(() => cancelActivity(completed)).toThrow(InvalidActivityTransitionError);
  });
});
