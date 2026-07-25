import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  ComponentNotFoundError,
  DuplicateComponentKeyError,
  EmptyFeeStructureCodeError,
  EmptyFeeStructureNameError,
  FeeStructureNotEditableError,
  InvalidCurrencyError,
  InvalidFeeStructureTransitionError,
} from "./errors";
import { type FeeComponent, type FeeComponentInput, makeFeeComponent } from "./fee-component";
import type { FeeStructureStatus } from "./finance-value";
import { isCurrencyCode, type Money, money } from "./money";

/**
 * A fee structure — a reusable fee-schedule template (a set of {@link FeeComponent} charge lines in a
 * single currency) an organization bills students against. It runs `draft → active → archived`; its
 * components are editable **only while draft** and frozen once active, so issued invoices always
 * reference a stable schedule. Each component `key` is unique within the structure; the `code` is
 * unique within the tenant.
 */
export interface FeeStructure {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly academicYear: string | null;
  readonly currency: string;
  readonly components: readonly FeeComponent[];
  readonly status: FeeStructureStatus;
  readonly version: number;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateFeeStructureParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly currency: string;
  readonly academicYear?: string | null;
  readonly components?: readonly FeeComponentInput[];
}

/** Build the component list, rejecting duplicate keys. */
function buildComponents(inputs: readonly FeeComponentInput[]): FeeComponent[] {
  const seen = new Set<string>();
  const components: FeeComponent[] = [];
  for (const input of inputs) {
    const component = makeFeeComponent(input);
    if (seen.has(component.key)) {
      throw new DuplicateComponentKeyError(component.key);
    }
    seen.add(component.key);
    components.push(component);
  }
  return components;
}

/** Create a fee structure in `draft`. Code, name and a valid currency required; components optional. */
export function createFeeStructure(params: CreateFeeStructureParams): FeeStructure {
  const code = params.code.trim();
  if (code.length === 0) {
    throw new EmptyFeeStructureCodeError();
  }
  const name = params.name.trim();
  if (name.length === 0) {
    throw new EmptyFeeStructureNameError();
  }
  if (!isCurrencyCode(params.currency)) {
    throw new InvalidCurrencyError(params.currency);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    code,
    name,
    academicYear: params.academicYear?.trim() || null,
    currency: params.currency,
    components: buildComponents(params.components ?? []),
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (structure: FeeStructure, patch: Partial<FeeStructure>): FeeStructure => ({
  ...structure,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (structure: FeeStructure): void => {
  if (structure.status !== "draft") {
    throw new FeeStructureNotEditableError(structure.id, structure.status);
  }
};

/** Rename a fee structure. */
export function renameFeeStructure(structure: FeeStructure, name: string): FeeStructure {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyFeeStructureNameError();
  }
  return touch(structure, { name: trimmed });
}

/** Set (or clear) the fee structure's academic year. */
export const setFeeStructureAcademicYear = (
  structure: FeeStructure,
  academicYear: string | null,
): FeeStructure => touch(structure, { academicYear: academicYear?.trim() || null });

/** Add a component to a draft fee structure (unique key), bumping the version. */
export function addFeeComponent(structure: FeeStructure, input: FeeComponentInput): FeeStructure {
  requireDraft(structure);
  const component = makeFeeComponent(input);
  if (structure.components.some((c) => c.key === component.key)) {
    throw new DuplicateComponentKeyError(component.key);
  }
  return touch(structure, {
    components: [...structure.components, component],
    version: structure.version + 1,
  });
}

/** Remove a component from a draft fee structure, bumping the version. */
export function removeFeeComponent(structure: FeeStructure, key: string): FeeStructure {
  requireDraft(structure);
  if (!structure.components.some((c) => c.key === key)) {
    throw new ComponentNotFoundError(key);
  }
  return touch(structure, {
    components: structure.components.filter((c) => c.key !== key),
    version: structure.version + 1,
  });
}

/** Change a component's amount on a draft fee structure, bumping the version. */
export function updateFeeComponentAmount(
  structure: FeeStructure,
  key: string,
  amountMinor: number,
): FeeStructure {
  requireDraft(structure);
  const existing = structure.components.find((c) => c.key === key);
  if (!existing) {
    throw new ComponentNotFoundError(key);
  }
  const updated = makeFeeComponent({ ...existing, amountMinor });
  return touch(structure, {
    components: structure.components.map((c) => (c.key === key ? updated : c)),
    version: structure.version + 1,
  });
}

/** Adopt a draft fee structure (its components are now frozen). */
export function activateFeeStructure(structure: FeeStructure): FeeStructure {
  if (structure.status !== "draft") {
    throw new InvalidFeeStructureTransitionError(structure.status, "active");
  }
  return touch(structure, { status: "active" });
}

/** Retire an active fee structure. */
export function archiveFeeStructure(structure: FeeStructure): FeeStructure {
  if (structure.status !== "active") {
    throw new InvalidFeeStructureTransitionError(structure.status, "archived");
  }
  return touch(structure, { status: "archived" });
}

/** The total of all component amounts as {@link Money} in the structure's currency. */
export function feeStructureTotal(structure: FeeStructure): Money {
  const total = structure.components.reduce((sum, c) => sum + c.amountMinor, 0);
  return money(total, structure.currency);
}

/** Whether the fee structure is currently active (billable). */
export const isFeeStructureActive = (structure: FeeStructure): boolean =>
  structure.status === "active";
