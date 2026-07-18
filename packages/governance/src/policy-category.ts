/**
 * The category of an institutional policy. Governs how policies are grouped and
 * which domain consumes them (e.g. the attendance domain reads `attendance`
 * policies). `other` accommodates institution-specific policies.
 */
export type PolicyCategory =
  | "admission"
  | "attendance"
  | "examination"
  | "hr"
  | "procurement"
  | "financial"
  | "child_protection"
  | "it_security"
  | "other";

export const POLICY_CATEGORIES: readonly PolicyCategory[] = [
  "admission",
  "attendance",
  "examination",
  "hr",
  "procurement",
  "financial",
  "child_protection",
  "it_security",
  "other",
];

/** Type guard for a {@link PolicyCategory}. */
export const isPolicyCategory = (value: string): value is PolicyCategory =>
  (POLICY_CATEGORIES as readonly string[]).includes(value);
