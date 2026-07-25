import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import { type FeeStructure, feeStructureTotal } from "./fee-structure";
import type { FinancialPeriod } from "./financial-period";

// --- Financial period ------------------------------------------------------------
export const PERIOD_OPENED = "finance.period.opened";
export const PERIOD_CLOSED = "finance.period.closed";
export const PERIOD_REOPENED = "finance.period.reopened";

export interface PeriodEventPayload {
  readonly periodId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly status: string;
}

export type PeriodOpenedEvent = DomainEvent<typeof PERIOD_OPENED, PeriodEventPayload>;
export type PeriodClosedEvent = DomainEvent<typeof PERIOD_CLOSED, PeriodEventPayload>;
export type PeriodReopenedEvent = DomainEvent<typeof PERIOD_REOPENED, PeriodEventPayload>;

const periodPayload = (period: FinancialPeriod): PeriodEventPayload => ({
  periodId: period.id,
  organizationId: period.organizationId,
  code: period.code,
  status: period.status,
});

export const periodOpened = (period: FinancialPeriod): PeriodOpenedEvent =>
  createEvent(PERIOD_OPENED, periodPayload(period), { tenantId: period.tenantId });

export const periodClosed = (period: FinancialPeriod): PeriodClosedEvent =>
  createEvent(PERIOD_CLOSED, periodPayload(period), { tenantId: period.tenantId });

export const periodReopened = (period: FinancialPeriod): PeriodReopenedEvent =>
  createEvent(PERIOD_REOPENED, periodPayload(period), { tenantId: period.tenantId });

// --- Fee structure ---------------------------------------------------------------
export const FEE_STRUCTURE_CREATED = "finance.fee_structure.created";
export const FEE_STRUCTURE_ACTIVATED = "finance.fee_structure.activated";
export const FEE_STRUCTURE_ARCHIVED = "finance.fee_structure.archived";

export interface FeeStructureEventPayload {
  readonly feeStructureId: Uuid;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly componentCount: number;
  readonly totalMinor: number;
  readonly currency: string;
  readonly status: string;
}

export type FeeStructureCreatedEvent = DomainEvent<
  typeof FEE_STRUCTURE_CREATED,
  FeeStructureEventPayload
>;
export type FeeStructureActivatedEvent = DomainEvent<
  typeof FEE_STRUCTURE_ACTIVATED,
  FeeStructureEventPayload
>;
export type FeeStructureArchivedEvent = DomainEvent<
  typeof FEE_STRUCTURE_ARCHIVED,
  FeeStructureEventPayload
>;

const feeStructurePayload = (structure: FeeStructure): FeeStructureEventPayload => ({
  feeStructureId: structure.id,
  organizationId: structure.organizationId,
  code: structure.code,
  componentCount: structure.components.length,
  totalMinor: feeStructureTotal(structure).amountMinor,
  currency: structure.currency,
  status: structure.status,
});

export const feeStructureCreated = (structure: FeeStructure): FeeStructureCreatedEvent =>
  createEvent(FEE_STRUCTURE_CREATED, feeStructurePayload(structure), {
    tenantId: structure.tenantId,
  });

export const feeStructureActivated = (structure: FeeStructure): FeeStructureActivatedEvent =>
  createEvent(FEE_STRUCTURE_ACTIVATED, feeStructurePayload(structure), {
    tenantId: structure.tenantId,
  });

export const feeStructureArchived = (structure: FeeStructure): FeeStructureArchivedEvent =>
  createEvent(FEE_STRUCTURE_ARCHIVED, feeStructurePayload(structure), {
    tenantId: structure.tenantId,
  });
