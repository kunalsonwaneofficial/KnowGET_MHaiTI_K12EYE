import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { ContractNotEditableError, InvalidContractTransitionError } from "./errors";
import type { ContractStatus, EmploymentType } from "./workforce-value";

/**
 * A version-controlled employment contract for an {@link Employee}. Each contract is one immutable
 * version (v1, v2, …); a new version supersedes the prior active one, so the full contractual
 * history is preserved. A contract carries the employment type, the pay **grade/band label only**
 * (never a compensation amount — that belongs to the Financial platform, P2-D14), the term dates and
 * free-text terms, and follows a `draft → active → expired | terminated` lifecycle. Only a draft may
 * be edited; once active it is frozen and a change means a new version.
 */
export interface EmploymentContract {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly version: number;
  readonly employmentType: EmploymentType;
  readonly grade: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly terms: string | null;
  readonly status: ContractStatus;
  readonly supersedesContractId: Uuid | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface DraftContractParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly version: number;
  readonly employmentType: EmploymentType;
  readonly startDate: string;
  readonly grade?: string | null;
  readonly endDate?: string | null;
  readonly terms?: string | null;
}

/** Draft a new contract version (status `draft`). */
export function draftContract(params: DraftContractParams): EmploymentContract {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    version: params.version,
    employmentType: params.employmentType,
    grade: params.grade?.trim() || null,
    startDate: params.startDate,
    endDate: params.endDate ?? null,
    terms: params.terms?.trim() || null,
    status: "draft",
    supersedesContractId: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  contract: EmploymentContract,
  patch: Partial<EmploymentContract>,
): EmploymentContract => ({
  ...contract,
  ...patch,
  updatedAt: nowIso(),
});

const requireDraft = (contract: EmploymentContract): void => {
  if (contract.status !== "draft") {
    throw new ContractNotEditableError(contract.id, contract.status);
  }
};

/** Set (or clear) the pay grade/band label on a draft. No compensation amount is stored. */
export function setContractGrade(
  contract: EmploymentContract,
  grade: string | null,
): EmploymentContract {
  requireDraft(contract);
  return touch(contract, { grade: grade?.trim() || null });
}

/** Set (or clear) the term end date on a draft. */
export function setContractEndDate(
  contract: EmploymentContract,
  endDate: string | null,
): EmploymentContract {
  requireDraft(contract);
  return touch(contract, { endDate });
}

/** Set (or clear) the free-text terms on a draft. */
export function setContractTerms(
  contract: EmploymentContract,
  terms: string | null,
): EmploymentContract {
  requireDraft(contract);
  return touch(contract, { terms: terms?.trim() || null });
}

/**
 * Activate a draft contract, optionally recording the prior version it supersedes. The application
 * service is responsible for expiring that superseded contract and enforcing one active per employee.
 */
export function activateContract(
  contract: EmploymentContract,
  supersedesContractId: Uuid | null = null,
): EmploymentContract {
  if (contract.status !== "draft") {
    throw new InvalidContractTransitionError(contract.status, "active");
  }
  return touch(contract, { status: "active", supersedesContractId });
}

/** Expire an active contract (its term has ended, or it is superseded by a new version). */
export function expireContract(contract: EmploymentContract): EmploymentContract {
  if (contract.status !== "active") {
    throw new InvalidContractTransitionError(contract.status, "expired");
  }
  return touch(contract, { status: "expired" });
}

/** Terminate a draft or active contract (ended early). */
export function terminateContract(contract: EmploymentContract): EmploymentContract {
  if (contract.status !== "draft" && contract.status !== "active") {
    throw new InvalidContractTransitionError(contract.status, "terminated");
  }
  return touch(contract, { status: "terminated" });
}

/** Whether the contract is the currently-active version. */
export const isContractActive = (contract: EmploymentContract): boolean =>
  contract.status === "active";
