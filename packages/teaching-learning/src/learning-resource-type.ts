import type { ISODateString } from "@knowget/types";

/**
 * The kind of learning resource. `external_reference` points to material outside the platform;
 * `ai_generated` marks a resource produced by an AI assistant (the platform records the
 * provenance — generation itself is not a P2-D09 concern). The type is descriptive metadata;
 * every resource shares the same versioned library lifecycle.
 */
export const LEARNING_RESOURCE_TYPES = [
  "document",
  "presentation",
  "video",
  "interactive",
  "external_reference",
  "ai_generated",
] as const;

export type LearningResourceType = (typeof LEARNING_RESOURCE_TYPES)[number];

/** Lifecycle of a learning resource. Only a `published` resource is offered for reuse. */
export const LEARNING_RESOURCE_STATUSES = ["draft", "published", "archived"] as const;

export type LearningResourceStatus = (typeof LEARNING_RESOURCE_STATUSES)[number];

/** Narrow an arbitrary string to a {@link LearningResourceType}. */
export const isLearningResourceType = (value: string): value is LearningResourceType =>
  (LEARNING_RESOURCE_TYPES as readonly string[]).includes(value);

/** One entry in a learning resource's append-only revision log. */
export interface LearningResourceRevision {
  readonly version: number;
  readonly note: string;
  readonly revisedAt: ISODateString;
}
