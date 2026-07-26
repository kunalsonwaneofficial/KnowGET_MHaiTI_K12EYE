import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyMaintenanceCodeError,
  EmptyMaintenanceSummaryError,
  InvalidMaintenanceTransitionError,
} from "./errors";
import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from "./facilities-value";

/**
 * A maintenance order — an operational work order raised against a building and, optionally, a specific
 * space and/or fixed system: fix a leak, inspect a fire panel, clean a hall, upgrade a switchboard. It
 * carries a code (unique within the tenant), a short summary, a category and a priority, and runs
 * `reported → assigned → in_progress → completed` (with `cancelled` reachable from any open state). An
 * assignee is an Employee (P2-D12). Nothing here is money — costed/capitalized maintenance of movable
 * assets is the Asset register's (P2-D15); this is the operational campus work queue.
 */
export interface MaintenanceOrder {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly spaceId: Uuid | null;
  readonly systemId: Uuid | null;
  readonly code: string;
  readonly summary: string;
  readonly category: MaintenanceCategory;
  readonly priority: MaintenancePriority;
  readonly status: MaintenanceStatus;
  readonly assigneeId: Uuid | null;
  readonly reportedOn: string;
  readonly assignedOn: string | null;
  readonly completedOn: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ReportMaintenanceOrderParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly buildingId: Uuid;
  readonly spaceId?: Uuid | null;
  readonly systemId?: Uuid | null;
  readonly code: string;
  readonly summary: string;
  readonly category: MaintenanceCategory;
  readonly priority: MaintenancePriority;
  readonly reportedOn: string;
}

const OPEN: readonly MaintenanceStatus[] = ["reported", "assigned", "in_progress"];

/** Whether a work order is still open (non-terminal). */
export const isMaintenanceOrderOpen = (order: MaintenanceOrder): boolean =>
  OPEN.includes(order.status);

/** Report a maintenance order (status `reported`, unassigned). Code and summary required. */
export function reportMaintenanceOrder(params: ReportMaintenanceOrderParams): MaintenanceOrder {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyMaintenanceCodeError();
  }
  const summary = params.summary.trim();
  if (summary.length === 0) {
    throw new EmptyMaintenanceSummaryError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    spaceId: params.spaceId ?? null,
    systemId: params.systemId ?? null,
    code,
    summary,
    category: params.category,
    priority: params.priority,
    status: "reported",
    assigneeId: null,
    reportedOn: params.reportedOn,
    assignedOn: null,
    completedOn: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (order: MaintenanceOrder, patch: Partial<MaintenanceOrder>): MaintenanceOrder => ({
  ...order,
  ...patch,
  updatedAt: nowIso(),
});

/** Assign a reported order to an employee (→ `assigned`, recording the assigned date). */
export function assignMaintenanceOrder(
  order: MaintenanceOrder,
  assigneeId: Uuid,
  assignedOn: string,
): MaintenanceOrder {
  if (order.status !== "reported") {
    throw new InvalidMaintenanceTransitionError(order.status, "assigned");
  }
  return touch(order, { status: "assigned", assigneeId, assignedOn });
}

/** Reassign an open (assigned or in-progress) order to a different employee, keeping its status. */
export function reassignMaintenanceOrder(
  order: MaintenanceOrder,
  assigneeId: Uuid,
): MaintenanceOrder {
  if (order.status !== "assigned" && order.status !== "in_progress") {
    throw new InvalidMaintenanceTransitionError(order.status, "reassigned");
  }
  return touch(order, { assigneeId });
}

/** Change the priority of an open order. */
export function setMaintenancePriority(
  order: MaintenanceOrder,
  priority: MaintenancePriority,
): MaintenanceOrder {
  if (!isMaintenanceOrderOpen(order)) {
    throw new InvalidMaintenanceTransitionError(order.status, "reprioritized");
  }
  return touch(order, { priority });
}

/** Start work on an assigned order (→ `in_progress`). */
export function startMaintenanceOrder(order: MaintenanceOrder): MaintenanceOrder {
  if (order.status !== "assigned") {
    throw new InvalidMaintenanceTransitionError(order.status, "in_progress");
  }
  return touch(order, { status: "in_progress" });
}

/** Complete an in-progress order (→ `completed`, recording the completion date). */
export function completeMaintenanceOrder(
  order: MaintenanceOrder,
  completedOn: string,
): MaintenanceOrder {
  if (order.status !== "in_progress") {
    throw new InvalidMaintenanceTransitionError(order.status, "completed");
  }
  return touch(order, { status: "completed", completedOn });
}

/** Cancel an open order (→ `cancelled`, terminal). */
export function cancelMaintenanceOrder(order: MaintenanceOrder): MaintenanceOrder {
  if (!isMaintenanceOrderOpen(order)) {
    throw new InvalidMaintenanceTransitionError(order.status, "cancelled");
  }
  return touch(order, { status: "cancelled" });
}
