import { nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { type WorkflowDefinition, WorkflowEngine, type WorkflowInstance } from "@knowget/workflow";
import { SelfApprovalError } from "./errors";

/**
 * The governance subjects that route through the reusable approval workflow. One
 * workflow definition serves policy, committee, resolution and delegation approval
 * — the contract's "reusable workflows" — reusing the Phase-1 workflow engine.
 */
export type ApprovalKind = "policy" | "committee" | "resolution" | "delegation";

/** The states of the reusable governance approval workflow. */
export type ApprovalState = "draft" | "in_review" | "approved" | "rejected";

/** The events that drive the approval workflow. */
export type ApprovalEvent = "submit" | "approve" | "reject" | "request_changes";

/**
 * The data carried through an approval workflow instance and inspected by guards.
 * `decidedById` is the reviewer who approved/rejected; the approve guard enforces
 * segregation of duties (a submitter cannot approve their own subject).
 */
export interface ApprovalData {
  readonly kind: ApprovalKind;
  readonly subjectId: Uuid;
  readonly submittedById: Uuid;
  readonly decidedById: Uuid | null;
  readonly note: string | null;
}

/**
 * The reusable governance approval workflow: `draft → in_review → approved | rejected`,
 * with `request_changes` returning a subject to `draft`. The approve transition is
 * guarded so the decider cannot be the submitter (segregation of duties). The same
 * definition is instantiated for every {@link ApprovalKind}.
 */
export const governanceApprovalWorkflow: WorkflowDefinition<ApprovalData> = {
  name: "governance.approval",
  initial: "draft",
  states: [
    { name: "draft" },
    { name: "in_review" },
    { name: "approved", final: true },
    { name: "rejected", final: true },
  ],
  transitions: [
    { from: "draft", on: "submit", to: "in_review" },
    {
      from: "in_review",
      on: "approve",
      to: "approved",
      guard: ({ data }) => data.decidedById !== data.submittedById,
    },
    { from: "in_review", on: "reject", to: "rejected" },
    { from: "in_review", on: "request_changes", to: "draft" },
  ],
};

const engine = new WorkflowEngine<ApprovalData>(governanceApprovalWorkflow);

/** An immutable record of a single approval-workflow transition. */
export interface ApprovalHistoryEntry {
  readonly from: string;
  readonly to: string;
  readonly event: string;
  readonly at: ISODateString;
}

/**
 * A persisted governance approval process — a workflow instance bound to the
 * institution and the subject under approval. Reusable across policy, committee,
 * resolution and delegation approval; the append-only `history` is the audit trail.
 */
export interface GovernanceApproval {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly kind: ApprovalKind;
  readonly subjectId: Uuid;
  readonly state: ApprovalState;
  readonly status: "running" | "completed";
  readonly submittedById: Uuid;
  readonly decidedById: Uuid | null;
  readonly note: string | null;
  readonly history: readonly ApprovalHistoryEntry[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface OpenApprovalParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly kind: ApprovalKind;
  readonly subjectId: Uuid;
  readonly submittedById: Uuid;
  readonly note?: string | null;
}

/** Open a new approval process for a governance subject (starts in `draft`). */
export function openApproval(params: OpenApprovalParams): GovernanceApproval {
  const instance = engine.start({
    kind: params.kind,
    subjectId: params.subjectId,
    submittedById: params.submittedById,
    decidedById: null,
    note: params.note?.trim() || null,
  });
  const now = nowIso();
  return {
    id: instance.id as Uuid,
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    kind: params.kind,
    subjectId: params.subjectId,
    state: instance.state as ApprovalState,
    status: instance.status,
    submittedById: params.submittedById,
    decidedById: null,
    note: instance.data.note,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rehydrate a workflow instance from a persisted approval. */
function toInstance(approval: GovernanceApproval): WorkflowInstance<ApprovalData> {
  return {
    id: approval.id,
    definition: governanceApprovalWorkflow.name,
    state: approval.state,
    data: {
      kind: approval.kind,
      subjectId: approval.subjectId,
      submittedById: approval.submittedById,
      decidedById: approval.decidedById,
      note: approval.note,
    },
    history: approval.history.map((h) => ({ ...h })),
    status: approval.status,
  };
}

/** Fold a transitioned workflow instance back onto the persisted approval. */
function fromInstance(
  approval: GovernanceApproval,
  instance: WorkflowInstance<ApprovalData>,
): GovernanceApproval {
  return {
    ...approval,
    state: instance.state as ApprovalState,
    status: instance.status,
    decidedById: instance.data.decidedById,
    note: instance.data.note,
    history: instance.history.map((h) => ({
      from: h.from,
      to: h.to,
      event: h.event,
      at: h.at,
    })),
    updatedAt: nowIso(),
  };
}

/** The events available from an approval's current state. */
export function availableApprovalEvents(approval: GovernanceApproval): string[] {
  return engine.availableEvents(toInstance(approval));
}

/** Submit a draft approval for review. */
export function submitApproval(approval: GovernanceApproval): GovernanceApproval {
  return fromInstance(approval, engine.send(toInstance(approval), "submit"));
}

export interface DecideApprovalParams {
  readonly decidedById: Uuid;
  readonly note?: string | null;
}

/** Approve a subject under review (rejecting an approval by its own submitter). */
export function approveApproval(
  approval: GovernanceApproval,
  params: DecideApprovalParams,
): GovernanceApproval {
  if (params.decidedById === approval.submittedById) {
    throw new SelfApprovalError(params.decidedById);
  }
  return fromInstance(
    approval,
    engine.send(toInstance(approval), "approve", {
      decidedById: params.decidedById,
      note: params.note?.trim() ?? approval.note,
    }),
  );
}

/** Reject a subject under review. */
export function rejectApproval(
  approval: GovernanceApproval,
  params: DecideApprovalParams,
): GovernanceApproval {
  return fromInstance(
    approval,
    engine.send(toInstance(approval), "reject", {
      decidedById: params.decidedById,
      note: params.note?.trim() ?? approval.note,
    }),
  );
}

/** Return a subject under review to its author for changes. */
export function requestApprovalChanges(
  approval: GovernanceApproval,
  note?: string | null,
): GovernanceApproval {
  return fromInstance(
    approval,
    engine.send(toInstance(approval), "request_changes", {
      note: note?.trim() ?? approval.note,
    }),
  );
}
