import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  InvalidRatingError,
  InvalidReviewTransitionError,
  MissingRatingError,
  ReviewNotEditableError,
} from "./errors";
import {
  acknowledgeReview,
  draftReview,
  finalizeReview,
  isReviewFinalized,
  setOverallRating,
  setReviewNarrative,
  submitReview,
} from "./performance-review";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const EMPLOYEE = "33333333-3333-3333-3333-333333333333" as Uuid;

const make = () =>
  draftReview({ tenantId: TENANT, organizationId: ORG, employeeId: EMPLOYEE, period: "2026-H1" });

describe("draftReview", () => {
  it("opens a draft and validates the rating range", () => {
    const r = make();
    expect(r.status).toBe("draft");
    expect(r.overallRating).toBeNull();
    expect(() =>
      draftReview({
        tenantId: TENANT,
        organizationId: ORG,
        employeeId: EMPLOYEE,
        period: "2026-H1",
        overallRating: 6,
      }),
    ).toThrow(InvalidRatingError);
  });
});

describe("review editing", () => {
  it("edits only while draft", () => {
    let r = setReviewNarrative(make(), { summary: "  Strong year  ", strengths: "Clarity" });
    r = setOverallRating(r, 4);
    expect(r.summary).toBe("Strong year");
    expect(r.overallRating).toBe(4);
    expect(() => setOverallRating(r, 7)).toThrow(InvalidRatingError);

    const submitted = submitReview(r);
    expect(() => setOverallRating(submitted, 3)).toThrow(ReviewNotEditableError);
    expect(() => setReviewNarrative(submitted, { summary: "x" })).toThrow(ReviewNotEditableError);
  });
});

describe("review lifecycle", () => {
  it("runs draft → submitted → acknowledged → finalized", () => {
    const rated = setOverallRating(make(), 5);
    const submitted = submitReview(rated);
    expect(submitted.status).toBe("submitted");
    const acknowledged = acknowledgeReview(submitted);
    const finalized = finalizeReview(acknowledged);
    expect(finalized.status).toBe("finalized");
    expect(isReviewFinalized(finalized)).toBe(true);
  });

  it("cannot be submitted without a rating, and forbids skipping states", () => {
    expect(() => submitReview(make())).toThrow(MissingRatingError);
    const rated = setOverallRating(make(), 3);
    expect(() => acknowledgeReview(rated)).toThrow(InvalidReviewTransitionError);
    expect(() => finalizeReview(submitReview(rated))).toThrow(InvalidReviewTransitionError);
  });
});
