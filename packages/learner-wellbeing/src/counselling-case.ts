import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  CounsellingCaseStatus,
  CounsellingGoal,
  CounsellingGoalStatus,
  CounsellingPriority,
  CounsellingReferral,
  CounsellingSession,
} from "./counselling";
import {
  CounsellingCaseClosedError,
  CounsellingGoalNotFoundError,
  EmptyCounsellingEntryError,
} from "./errors";

/**
 * A counselling case for a learner — case registration, confidential session history,
 * referrals, goals, and a closure outcome. Unlike the profile and record aggregates a
 * learner may have **many** cases over time, so a case is identified in its own right.
 * Access is isolated behind the enhanced-privacy `counselling:*` scope. The learner is a
 * P2-D03 Student; the case derives its organization from the student and links to a
 * counsellor Person.
 */
export interface CounsellingCase {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly counsellorId: Uuid;
  readonly presentingConcern: string;
  readonly priority: CounsellingPriority;
  readonly status: CounsellingCaseStatus;
  readonly sessions: readonly CounsellingSession[];
  readonly referrals: readonly CounsellingReferral[];
  readonly goals: readonly CounsellingGoal[];
  readonly outcome: string | null;
  readonly openedAt: ISODateString;
  readonly closedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenCounsellingCaseParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly studentId: Uuid;
  readonly counsellorId: Uuid;
  readonly presentingConcern: string;
  readonly priority?: CounsellingPriority;
}

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new EmptyCounsellingEntryError(field);
  }
  return trimmed;
};

/** Open (register) a new counselling case for a learner. */
export function openCounsellingCase(params: OpenCounsellingCaseParams): CounsellingCase {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    studentId: params.studentId,
    counsellorId: params.counsellorId,
    presentingConcern: requireText(params.presentingConcern, "presenting concern"),
    priority: params.priority ?? "normal",
    status: "open",
    sessions: [],
    referrals: [],
    goals: [],
    outcome: null,
    openedAt: now,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (kase: CounsellingCase, patch: Partial<CounsellingCase>): CounsellingCase => ({
  ...kase,
  ...patch,
  updatedAt: nowIso(),
});

const assertOpen = (kase: CounsellingCase): void => {
  if (kase.status === "closed") {
    throw new CounsellingCaseClosedError(kase.id);
  }
};

/** Reassign the case to a different counsellor (only while open). */
export function assignCounsellor(kase: CounsellingCase, counsellorId: Uuid): CounsellingCase {
  assertOpen(kase);
  return touch(kase, { counsellorId });
}

/** Change the case priority (only while open). */
export function setCasePriority(
  kase: CounsellingCase,
  priority: CounsellingPriority,
): CounsellingCase {
  assertOpen(kase);
  return touch(kase, { priority });
}

export interface RecordSessionInput {
  readonly note: string;
  readonly recordedBy: Uuid;
  readonly occurredOn?: string;
}

/** Record a confidential counselling session; returns it. Append-only, only while open. */
export function recordSession(
  kase: CounsellingCase,
  input: RecordSessionInput,
): { kase: CounsellingCase; session: CounsellingSession } {
  assertOpen(kase);
  const now = nowIso();
  const session: CounsellingSession = {
    id: newUuid(),
    occurredOn: input.occurredOn?.trim() || now.slice(0, 10),
    note: requireText(input.note, "session note"),
    recordedBy: input.recordedBy,
    recordedAt: now,
  };
  return {
    kase: touch(kase, { sessions: [...kase.sessions, session] }),
    session,
  };
}

export interface AddReferralInput {
  readonly referredTo: string;
  readonly reason: string;
}

/** Add a referral out of the case; returns it. Only while open. */
export function addReferral(
  kase: CounsellingCase,
  input: AddReferralInput,
): { kase: CounsellingCase; referral: CounsellingReferral } {
  assertOpen(kase);
  const referral: CounsellingReferral = {
    id: newUuid(),
    referredTo: requireText(input.referredTo, "referral target"),
    reason: requireText(input.reason, "referral reason"),
    referredAt: nowIso(),
  };
  return {
    kase: touch(kase, { referrals: [...kase.referrals, referral] }),
    referral,
  };
}

/** Set a counselling goal; returns it. Only while open. */
export function setCounsellingGoal(
  kase: CounsellingCase,
  description: string,
): { kase: CounsellingCase; goal: CounsellingGoal } {
  assertOpen(kase);
  const goal: CounsellingGoal = {
    id: newUuid(),
    description: requireText(description, "goal description"),
    status: "active",
    setAt: nowIso(),
  };
  return { kase: touch(kase, { goals: [...kase.goals, goal] }), goal };
}

/** Update a counselling goal's status. Only while open. */
export function updateCounsellingGoalStatus(
  kase: CounsellingCase,
  goalId: Uuid,
  status: CounsellingGoalStatus,
): CounsellingCase {
  assertOpen(kase);
  if (!kase.goals.some((g) => g.id === goalId)) {
    throw new CounsellingGoalNotFoundError(goalId);
  }
  return touch(kase, {
    goals: kase.goals.map((g) => (g.id === goalId ? { ...g, status } : g)),
  });
}

/** Close the case with an outcome. Idempotency is not implied — closing twice errors. */
export function closeCounsellingCase(kase: CounsellingCase, outcome: string): CounsellingCase {
  assertOpen(kase);
  return touch(kase, {
    status: "closed",
    outcome: requireText(outcome, "outcome"),
    closedAt: nowIso(),
  });
}
