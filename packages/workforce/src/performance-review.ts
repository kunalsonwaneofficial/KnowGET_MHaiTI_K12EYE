import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  InvalidRatingError,
  InvalidReviewTransitionError,
  MissingRatingError,
  ReviewNotEditableError,
} from "./errors";
import type { ReviewStatus } from "./workforce-value";

/**
 * A performance review — an appraisal of an {@link Employee} for a review period, with an overall
 * 1–5 rating and narrative notes. It follows the lifecycle `draft → submitted → acknowledged →
 * finalized`; only a **finalized** review counts toward an employee's review standing in the
 * workforce-intelligence engine. Content may be edited only while draft; once submitted it is frozen.
 */
export interface PerformanceReview {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly reviewerId: Uuid | null;
  readonly period: string;
  readonly overallRating: number | null;
  readonly summary: string | null;
  readonly strengths: string | null;
  readonly improvements: string | null;
  readonly status: ReviewStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftReviewParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly period: string;
  readonly reviewerId?: Uuid | null;
  readonly overallRating?: number | null;
  readonly summary?: string | null;
  readonly strengths?: string | null;
  readonly improvements?: string | null;
}

const assertRating = (rating: number | null | undefined): void => {
  if (
    rating !== null &&
    rating !== undefined &&
    !(Number.isFinite(rating) && rating >= 1 && rating <= 5)
  ) {
    throw new InvalidRatingError(rating);
  }
};

/** Open a review in `draft`. */
export function draftReview(params: DraftReviewParams): PerformanceReview {
  assertRating(params.overallRating);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    reviewerId: params.reviewerId ?? null,
    period: params.period,
    overallRating: params.overallRating ?? null,
    summary: params.summary?.trim() || null,
    strengths: params.strengths?.trim() || null,
    improvements: params.improvements?.trim() || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  review: PerformanceReview,
  patch: Partial<PerformanceReview>,
): PerformanceReview => ({
  ...review,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (review: PerformanceReview): void => {
  if (review.status !== "draft") {
    throw new ReviewNotEditableError(review.id, review.status);
  }
};

/** Set (or clear) the overall 1–5 rating on a draft. */
export function setOverallRating(
  review: PerformanceReview,
  overallRating: number | null,
): PerformanceReview {
  requireDraft(review);
  assertRating(overallRating);
  return touch(review, { overallRating });
}

/** Set (or clear) the narrative fields on a draft. */
export function setReviewNarrative(
  review: PerformanceReview,
  narrative: {
    readonly summary?: string | null;
    readonly strengths?: string | null;
    readonly improvements?: string | null;
  },
): PerformanceReview {
  requireDraft(review);
  return touch(review, {
    ...(narrative.summary !== undefined ? { summary: narrative.summary?.trim() || null } : {}),
    ...(narrative.strengths !== undefined
      ? { strengths: narrative.strengths?.trim() || null }
      : {}),
    ...(narrative.improvements !== undefined
      ? { improvements: narrative.improvements?.trim() || null }
      : {}),
  });
}

/** Submit a draft for acknowledgement. Requires an overall rating. */
export function submitReview(review: PerformanceReview): PerformanceReview {
  if (review.status !== "draft") {
    throw new InvalidReviewTransitionError(review.status, "submitted");
  }
  if (review.overallRating === null) {
    throw new MissingRatingError(review.id);
  }
  return touch(review, { status: "submitted" });
}

/** The employee acknowledges a submitted review. */
export function acknowledgeReview(review: PerformanceReview): PerformanceReview {
  if (review.status !== "submitted") {
    throw new InvalidReviewTransitionError(review.status, "acknowledged");
  }
  return touch(review, { status: "acknowledged" });
}

/** Finalize an acknowledged review — it now counts toward review standing. */
export function finalizeReview(review: PerformanceReview): PerformanceReview {
  if (review.status !== "acknowledged") {
    throw new InvalidReviewTransitionError(review.status, "finalized");
  }
  return touch(review, { status: "finalized" });
}

/** Whether the review is finalized (and therefore counts toward review standing). */
export const isReviewFinalized = (review: PerformanceReview): boolean =>
  review.status === "finalized";
