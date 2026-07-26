import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyAssertionError,
  InvalidAssertionTransitionError,
  MissingEvidenceSourceError,
  UngroundedAssertionError,
} from "./errors";
import {
  type AssertionMethod,
  type AssertionStatus,
  type SubjectKind,
  clampConfidence,
  isGroundedMethod,
} from "./knowledge-value";

/**
 * An assertion — the unit of the evidence chain, and the enforcement point of the contract's defining rule:
 * **every assertion carries an evidence chain and is explainable**. It states a claim (`predicate = value`)
 * about a subject (an entity or a relationship), by a `method`, with a `confidence`. A *grounded* assertion
 * (`observed`/`declared`) names where it came from (`evidenceSource`); a derived or inferred one cites the
 * assertions it was concluded from (`derivedFrom`) — it may not stand on nothing. The record is **immutable**:
 * a claim is never edited, only `retracted`. The value is content — it never leaves the domain in an event.
 */
export interface Assertion {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectKind: SubjectKind;
  readonly subjectId: Uuid;
  readonly predicate: string;
  readonly value: string;
  readonly method: AssertionMethod;
  readonly confidence: number;
  readonly evidenceSource: string | null;
  readonly evidenceRef: string | null;
  readonly derivedFrom: readonly Uuid[];
  readonly assertedOn: string;
  readonly status: AssertionStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAssertionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subjectKind: SubjectKind;
  readonly subjectId: Uuid;
  readonly predicate: string;
  readonly value: string;
  readonly method: AssertionMethod;
  readonly confidence: number;
  readonly evidenceSource?: string | null;
  readonly evidenceRef?: string | null;
  readonly derivedFrom?: readonly Uuid[];
  readonly assertedOn?: string;
}

/**
 * Create an assertion (status `asserted`). Enforces the local evidence-chain rule: a grounded assertion must
 * name an evidence source; a derived/inferred one must cite at least one antecedent (the service then checks
 * those antecedents exist). Predicate and value required; confidence clamped 0–100; `derivedFrom` de-duplicated.
 */
export function createAssertion(params: CreateAssertionParams): Assertion {
  const predicate = params.predicate.trim();
  const value = params.value.trim();
  if (predicate.length === 0 || value.length === 0 || !params.subjectId) {
    throw new EmptyAssertionError();
  }
  const derivedFrom = [...new Set(params.derivedFrom ?? [])];
  const evidenceSource = params.evidenceSource?.trim() || null;
  if (isGroundedMethod(params.method)) {
    if (evidenceSource === null) {
      throw new MissingEvidenceSourceError(params.method);
    }
  } else if (derivedFrom.length === 0) {
    throw new UngroundedAssertionError(params.method);
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subjectKind: params.subjectKind,
    subjectId: params.subjectId,
    predicate,
    value,
    method: params.method,
    confidence: clampConfidence(params.confidence),
    evidenceSource,
    evidenceRef: params.evidenceRef?.trim() || null,
    derivedFrom,
    assertedOn: params.assertedOn?.trim() || now,
    status: "asserted",
    createdAt: now,
    updatedAt: now,
  };
}

/** Retract an asserted assertion (`asserted → retracted`, terminal). Withdraws the claim; the record is kept. */
export function retractAssertion(assertion: Assertion): Assertion {
  if (assertion.status !== "asserted") {
    throw new InvalidAssertionTransitionError(assertion.status, "retracted");
  }
  return { ...assertion, status: "retracted", updatedAt: nowIso() };
}

/** Whether the claim still stands (asserted). */
export const isAssertionStanding = (assertion: Assertion): boolean =>
  assertion.status === "asserted";
