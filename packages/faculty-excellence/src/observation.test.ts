import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  EmptyRatingsError,
  InvalidObservationRatingError,
  InvalidObservationTransitionError,
} from "./errors";
import {
  acknowledgeObservation,
  conductObservation,
  isObservationAcknowledged,
  observationCompetencyKeys,
  reviseObservation,
  scheduleObservation,
  shareObservation,
} from "./observation";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const FRAMEWORK = "33333333-3333-3333-3333-333333333333" as Uuid;
const EMPLOYEE = "44444444-4444-4444-4444-444444444444" as Uuid;
const OBSERVER = "55555555-5555-5555-5555-555555555555" as Uuid;

const make = () =>
  scheduleObservation({
    tenantId: TENANT,
    organizationId: ORG,
    frameworkId: FRAMEWORK,
    employeeId: EMPLOYEE,
    observerId: OBSERVER,
    observationType: "formal",
    observedOn: "2026-05-10",
  });

const ratings = [
  { competencyKey: "ped-1", rating: 3 },
  { competencyKey: "mgmt-1", rating: 4, comment: "  strong routines  " },
];

describe("scheduleObservation", () => {
  it("schedules with no ratings yet", () => {
    const obs = make();
    expect(obs.status).toBe("scheduled");
    expect(obs.ratings).toHaveLength(0);
    expect(obs.overallRating).toBeNull();
  });
});

describe("observation lifecycle", () => {
  it("conducts, computing the overall as the mean rating and trimming comments", () => {
    const conducted = conductObservation(make(), { ratings, strengths: "Clear objectives" });
    expect(conducted.status).toBe("conducted");
    expect(conducted.overallRating).toBe(3.5); // (3 + 4) / 2
    expect(conducted.ratings[1]?.comment).toBe("strong routines");
    expect(observationCompetencyKeys(conducted)).toEqual(["ped-1", "mgmt-1"]);
  });

  it("rejects empty or out-of-range ratings", () => {
    expect(() => conductObservation(make(), { ratings: [] })).toThrow(EmptyRatingsError);
    expect(() =>
      conductObservation(make(), { ratings: [{ competencyKey: "ped-1", rating: 5 }] }),
    ).toThrow(InvalidObservationRatingError);
  });

  it("runs conducted → shared → acknowledged", () => {
    const conducted = conductObservation(make(), { ratings });
    const revised = reviseObservation(conducted, {
      ratings: [{ competencyKey: "ped-1", rating: 2 }],
    });
    expect(revised.overallRating).toBe(2);
    const shared = shareObservation(revised);
    expect(shared.status).toBe("shared");
    expect(shared.sharedAt).not.toBeNull();
    const acknowledged = acknowledgeObservation(shared);
    expect(acknowledged.status).toBe("acknowledged");
    expect(isObservationAcknowledged(acknowledged)).toBe(true);
  });

  it("forbids illegal transitions", () => {
    const scheduled = make();
    expect(() => shareObservation(scheduled)).toThrow(InvalidObservationTransitionError);
    expect(() => acknowledgeObservation(scheduled)).toThrow(InvalidObservationTransitionError);
    const conducted = conductObservation(scheduled, { ratings });
    expect(() => acknowledgeObservation(conducted)).toThrow(InvalidObservationTransitionError);
    expect(() => reviseObservation(shareObservation(conducted), { ratings })).toThrow(
      InvalidObservationTransitionError,
    );
  });
});
