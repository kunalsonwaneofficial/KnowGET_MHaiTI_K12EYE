import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyPositionCodeError,
  EmptyPositionTitleError,
  InvalidHeadcountError,
  InvalidPositionTransitionError,
} from "./errors";
import type { EmploymentType, PositionStatus } from "./workforce-value";

/**
 * A position — a defined, budgeted post within a {@link Department} (for example "Mathematics
 * Teacher", approved headcount 5). It carries a title, the intended employment type, an approved
 * headcount, and the pay **grade/band label only** — compensation amounts belong to the Financial
 * platform (P2-D14), never here. A position follows a `draft → open → on_hold → closed` lifecycle;
 * employees are appointed against open positions (P2-D12 increment 3).
 */
export interface Position {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly departmentId: Uuid;
  readonly code: string;
  readonly title: string;
  readonly employmentType: EmploymentType;
  readonly headcount: number;
  readonly grade: string | null;
  readonly description: string | null;
  readonly status: PositionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreatePositionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly departmentId: Uuid;
  readonly code: string;
  readonly title: string;
  readonly employmentType: EmploymentType;
  readonly headcount?: number;
  readonly grade?: string | null;
  readonly description?: string | null;
}

const assertHeadcount = (headcount: number): void => {
  if (!Number.isInteger(headcount) || headcount < 1) {
    throw new InvalidHeadcountError(headcount);
  }
};

/** Create a position in `draft`. Code and title are required; headcount defaults to 1. */
export function createPosition(params: CreatePositionParams): Position {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyPositionCodeError();
  }
  const title = params.title.trim();
  if (title.length === 0) {
    throw new EmptyPositionTitleError();
  }
  const headcount = params.headcount ?? 1;
  assertHeadcount(headcount);
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    departmentId: params.departmentId,
    code,
    title,
    employmentType: params.employmentType,
    headcount,
    grade: params.grade?.trim() || null,
    description: params.description?.trim() || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (position: Position, patch: Partial<Position>): Position => ({
  ...position,
  ...patch,
  updatedAt: nowIso(),
});

const requireStatus = (
  position: Position,
  allowed: readonly PositionStatus[],
  to: PositionStatus,
): void => {
  if (!allowed.includes(position.status)) {
    throw new InvalidPositionTransitionError(position.status, to);
  }
};

/** Rename a position's title. */
export function retitlePosition(position: Position, title: string): Position {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new EmptyPositionTitleError();
  }
  return touch(position, { title: trimmed });
}

/** Set the approved headcount (a positive integer). */
export function setHeadcount(position: Position, headcount: number): Position {
  assertHeadcount(headcount);
  return touch(position, { headcount });
}

/** Set (or clear, with `null`) the pay grade/band label. No compensation amount is stored here. */
export const setGrade = (position: Position, grade: string | null): Position =>
  touch(position, { grade: grade?.trim() || null });

/** Set (or clear) the position description. */
export const setPositionDescription = (position: Position, description: string | null): Position =>
  touch(position, { description: description?.trim() || null });

/** Open a drafted position for staffing. */
export function openPosition(position: Position): Position {
  requireStatus(position, ["draft"], "open");
  return touch(position, { status: "open" });
}

/** Freeze an open position (hiring freeze) without closing it. */
export function holdPosition(position: Position): Position {
  requireStatus(position, ["open"], "on_hold");
  return touch(position, { status: "on_hold" });
}

/** Resume staffing on a held position. */
export function resumePosition(position: Position): Position {
  requireStatus(position, ["on_hold"], "open");
  return touch(position, { status: "open" });
}

/** Close a position permanently. */
export function closePosition(position: Position): Position {
  requireStatus(position, ["draft", "open", "on_hold"], "closed");
  return touch(position, { status: "closed" });
}

/** Whether the position is currently open for staffing. */
export const isPositionOpen = (position: Position): boolean => position.status === "open";
