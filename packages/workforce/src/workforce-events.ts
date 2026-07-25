import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Department } from "./department";
import type { Position } from "./position";

// --- Department ------------------------------------------------------------------
export const DEPARTMENT_CREATED = "workforce.department.created";
export const DEPARTMENT_ARCHIVED = "workforce.department.archived";

export interface DepartmentEventPayload {
  readonly departmentId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly status: string;
}

export type DepartmentCreatedEvent = DomainEvent<typeof DEPARTMENT_CREATED, DepartmentEventPayload>;
export type DepartmentArchivedEvent = DomainEvent<
  typeof DEPARTMENT_ARCHIVED,
  DepartmentEventPayload
>;

const departmentPayload = (department: Department): DepartmentEventPayload => ({
  departmentId: department.id,
  organizationId: department.organizationId,
  code: department.code,
  status: department.status,
});

export const departmentCreated = (department: Department): DepartmentCreatedEvent =>
  createEvent(DEPARTMENT_CREATED, departmentPayload(department), {
    tenantId: department.tenantId,
  });

export const departmentArchived = (department: Department): DepartmentArchivedEvent =>
  createEvent(DEPARTMENT_ARCHIVED, departmentPayload(department), {
    tenantId: department.tenantId,
  });

// --- Position --------------------------------------------------------------------
export const POSITION_CREATED = "workforce.position.created";
export const POSITION_OPENED = "workforce.position.opened";
export const POSITION_CLOSED = "workforce.position.closed";

export interface PositionEventPayload {
  readonly positionId: Uuid;
  readonly organizationId: Uuid;
  readonly departmentId: Uuid;
  readonly code: string;
  readonly employmentType: string;
  readonly headcount: number;
  readonly status: string;
}

export type PositionCreatedEvent = DomainEvent<typeof POSITION_CREATED, PositionEventPayload>;
export type PositionOpenedEvent = DomainEvent<typeof POSITION_OPENED, PositionEventPayload>;
export type PositionClosedEvent = DomainEvent<typeof POSITION_CLOSED, PositionEventPayload>;

const positionPayload = (position: Position): PositionEventPayload => ({
  positionId: position.id,
  organizationId: position.organizationId,
  departmentId: position.departmentId,
  code: position.code,
  employmentType: position.employmentType,
  headcount: position.headcount,
  status: position.status,
});

export const positionCreated = (position: Position): PositionCreatedEvent =>
  createEvent(POSITION_CREATED, positionPayload(position), { tenantId: position.tenantId });

export const positionOpened = (position: Position): PositionOpenedEvent =>
  createEvent(POSITION_OPENED, positionPayload(position), { tenantId: position.tenantId });

export const positionClosed = (position: Position): PositionClosedEvent =>
  createEvent(POSITION_CLOSED, positionPayload(position), { tenantId: position.tenantId });
