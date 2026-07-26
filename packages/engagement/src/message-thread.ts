import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyThreadSubjectError,
  InsufficientThreadParticipantsError,
  InvalidThreadTransitionError,
} from "./errors";
import type { ThreadStatus } from "./engagement-value";

/**
 * A message thread — a two-way (or group) conversation between a set of participant Persons on a subject
 * (e.g. a parent ↔ teacher exchange). It runs `open ↔ closed → archived`; only an open thread accepts new
 * messages, and archived is terminal. The messages themselves are the immutable append-only {@link Message}
 * log referencing this thread — the thread does not store the message list or a derived count, so the two
 * aggregates stay independent. A thread must always have at least two distinct participants.
 */
export interface MessageThread {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subject: string;
  readonly participantPersonIds: readonly Uuid[];
  readonly status: ThreadStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateMessageThreadParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subject: string;
  readonly participantPersonIds: readonly Uuid[];
}

const dedupe = (ids: readonly Uuid[]): Uuid[] => [...new Set(ids)];

/** Open a message thread (status `open`). Subject required; at least two distinct participants. */
export function createMessageThread(params: CreateMessageThreadParams): MessageThread {
  const subject = params.subject.trim();
  if (subject.length === 0) {
    throw new EmptyThreadSubjectError();
  }
  const participants = dedupe(params.participantPersonIds);
  if (participants.length < 2) {
    throw new InsufficientThreadParticipantsError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subject,
    participantPersonIds: participants,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (thread: MessageThread, patch: Partial<MessageThread>): MessageThread => ({
  ...thread,
  ...patch,
  updatedAt: nowIso(),
});

/** Add a participant to the thread (de-duplicated); not allowed once archived. */
export function addThreadParticipant(thread: MessageThread, personId: Uuid): MessageThread {
  if (thread.status === "archived") {
    throw new InvalidThreadTransitionError(thread.status, "participant-added");
  }
  if (thread.participantPersonIds.includes(personId)) {
    return thread;
  }
  return touch(thread, { participantPersonIds: [...thread.participantPersonIds, personId] });
}

/** Close an open thread (→ `closed`). */
export function closeThread(thread: MessageThread): MessageThread {
  if (thread.status !== "open") {
    throw new InvalidThreadTransitionError(thread.status, "closed");
  }
  return touch(thread, { status: "closed" });
}

/** Reopen a closed thread (→ `open`). */
export function reopenThread(thread: MessageThread): MessageThread {
  if (thread.status !== "closed") {
    throw new InvalidThreadTransitionError(thread.status, "open");
  }
  return touch(thread, { status: "open" });
}

/** Archive a thread (→ `archived`, terminal). */
export function archiveThread(thread: MessageThread): MessageThread {
  if (thread.status === "archived") {
    throw new InvalidThreadTransitionError(thread.status, "archived");
  }
  return touch(thread, { status: "archived" });
}

/** Whether the thread is open (accepting messages). */
export const isThreadOpen = (thread: MessageThread): boolean => thread.status === "open";

/** Whether the person is a participant of the thread. */
export const isThreadParticipant = (thread: MessageThread, personId: Uuid): boolean =>
  thread.participantPersonIds.includes(personId);
