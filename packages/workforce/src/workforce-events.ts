import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { Department } from "./department";
import type { Employee } from "./employee";
import type { EmploymentContract } from "./employment-contract";
import type { LeaveRequest } from "./leave-request";
import type { PerformanceReview } from "./performance-review";
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

// --- Employee --------------------------------------------------------------------
export const EMPLOYEE_ONBOARDED = "workforce.employee.onboarded";
export const EMPLOYEE_ACTIVATED = "workforce.employee.activated";
export const EMPLOYEE_SEPARATED = "workforce.employee.separated";
export const EMPLOYEE_BECAME_ALUMNI = "workforce.employee.became_alumni";

export interface EmployeeEventPayload {
  readonly employeeId: Uuid;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly employeeNumber: string;
  readonly status: string;
}

export type EmployeeOnboardedEvent = DomainEvent<typeof EMPLOYEE_ONBOARDED, EmployeeEventPayload>;
export type EmployeeActivatedEvent = DomainEvent<typeof EMPLOYEE_ACTIVATED, EmployeeEventPayload>;
export type EmployeeSeparatedEvent = DomainEvent<typeof EMPLOYEE_SEPARATED, EmployeeEventPayload>;
export type EmployeeBecameAlumniEvent = DomainEvent<
  typeof EMPLOYEE_BECAME_ALUMNI,
  EmployeeEventPayload
>;

const employeePayload = (employee: Employee): EmployeeEventPayload => ({
  employeeId: employee.id,
  organizationId: employee.organizationId,
  personId: employee.personId,
  employeeNumber: employee.employeeNumber,
  status: employee.status,
});

export const employeeOnboarded = (employee: Employee): EmployeeOnboardedEvent =>
  createEvent(EMPLOYEE_ONBOARDED, employeePayload(employee), { tenantId: employee.tenantId });

export const employeeActivated = (employee: Employee): EmployeeActivatedEvent =>
  createEvent(EMPLOYEE_ACTIVATED, employeePayload(employee), { tenantId: employee.tenantId });

export const employeeSeparated = (employee: Employee): EmployeeSeparatedEvent =>
  createEvent(EMPLOYEE_SEPARATED, employeePayload(employee), { tenantId: employee.tenantId });

export const employeeBecameAlumni = (employee: Employee): EmployeeBecameAlumniEvent =>
  createEvent(EMPLOYEE_BECAME_ALUMNI, employeePayload(employee), { tenantId: employee.tenantId });

// --- Employment contract ---------------------------------------------------------
export const CONTRACT_ISSUED = "workforce.contract.issued";
export const CONTRACT_ACTIVATED = "workforce.contract.activated";
export const CONTRACT_ENDED = "workforce.contract.ended";

export interface ContractEventPayload {
  readonly contractId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly version: number;
  readonly status: string;
}

export type ContractIssuedEvent = DomainEvent<typeof CONTRACT_ISSUED, ContractEventPayload>;
export type ContractActivatedEvent = DomainEvent<typeof CONTRACT_ACTIVATED, ContractEventPayload>;
export type ContractEndedEvent = DomainEvent<typeof CONTRACT_ENDED, ContractEventPayload>;

const contractPayload = (contract: EmploymentContract): ContractEventPayload => ({
  contractId: contract.id,
  organizationId: contract.organizationId,
  employeeId: contract.employeeId,
  version: contract.version,
  status: contract.status,
});

export const contractIssued = (contract: EmploymentContract): ContractIssuedEvent =>
  createEvent(CONTRACT_ISSUED, contractPayload(contract), { tenantId: contract.tenantId });

export const contractActivated = (contract: EmploymentContract): ContractActivatedEvent =>
  createEvent(CONTRACT_ACTIVATED, contractPayload(contract), { tenantId: contract.tenantId });

export const contractEnded = (contract: EmploymentContract): ContractEndedEvent =>
  createEvent(CONTRACT_ENDED, contractPayload(contract), { tenantId: contract.tenantId });

// --- Leave request ---------------------------------------------------------------
export const LEAVE_REQUESTED = "workforce.leave.requested";
export const LEAVE_APPROVED = "workforce.leave.approved";
export const LEAVE_REJECTED = "workforce.leave.rejected";
export const LEAVE_CANCELLED = "workforce.leave.cancelled";

export interface LeaveEventPayload {
  readonly leaveRequestId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly leaveType: string;
  readonly days: number;
  readonly status: string;
}

export type LeaveRequestedEvent = DomainEvent<typeof LEAVE_REQUESTED, LeaveEventPayload>;
export type LeaveApprovedEvent = DomainEvent<typeof LEAVE_APPROVED, LeaveEventPayload>;
export type LeaveRejectedEvent = DomainEvent<typeof LEAVE_REJECTED, LeaveEventPayload>;
export type LeaveCancelledEvent = DomainEvent<typeof LEAVE_CANCELLED, LeaveEventPayload>;

const leavePayload = (request: LeaveRequest): LeaveEventPayload => ({
  leaveRequestId: request.id,
  organizationId: request.organizationId,
  employeeId: request.employeeId,
  leaveType: request.leaveType,
  days: request.days,
  status: request.status,
});

export const leaveRequested = (request: LeaveRequest): LeaveRequestedEvent =>
  createEvent(LEAVE_REQUESTED, leavePayload(request), { tenantId: request.tenantId });

export const leaveApproved = (request: LeaveRequest): LeaveApprovedEvent =>
  createEvent(LEAVE_APPROVED, leavePayload(request), { tenantId: request.tenantId });

export const leaveRejected = (request: LeaveRequest): LeaveRejectedEvent =>
  createEvent(LEAVE_REJECTED, leavePayload(request), { tenantId: request.tenantId });

export const leaveCancelled = (request: LeaveRequest): LeaveCancelledEvent =>
  createEvent(LEAVE_CANCELLED, leavePayload(request), { tenantId: request.tenantId });

// --- Performance review ----------------------------------------------------------
export const REVIEW_SUBMITTED = "workforce.review.submitted";
export const REVIEW_FINALIZED = "workforce.review.finalized";

export interface ReviewEventPayload {
  readonly reviewId: Uuid;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly period: string;
  readonly overallRating: number | null;
  readonly status: string;
}

export type ReviewSubmittedEvent = DomainEvent<typeof REVIEW_SUBMITTED, ReviewEventPayload>;
export type ReviewFinalizedEvent = DomainEvent<typeof REVIEW_FINALIZED, ReviewEventPayload>;

const reviewPayload = (review: PerformanceReview): ReviewEventPayload => ({
  reviewId: review.id,
  organizationId: review.organizationId,
  employeeId: review.employeeId,
  period: review.period,
  overallRating: review.overallRating,
  status: review.status,
});

export const reviewSubmitted = (review: PerformanceReview): ReviewSubmittedEvent =>
  createEvent(REVIEW_SUBMITTED, reviewPayload(review), { tenantId: review.tenantId });

export const reviewFinalized = (review: PerformanceReview): ReviewFinalizedEvent =>
  createEvent(REVIEW_FINALIZED, reviewPayload(review), { tenantId: review.tenantId });
