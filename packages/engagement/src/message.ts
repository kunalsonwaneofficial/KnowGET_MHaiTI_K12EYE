import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { EmptyMessageBodyError } from "./errors";

/**
 * A message — an immutable, append-only entry in a {@link MessageThread}: an author Person's body, posted at
 * a moment. It has no lifecycle and no edit or delete path — a sent message is a fact; a correction is a new
 * message. The service posts a message only to an open thread and only by a participant.
 */
export interface Message {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly threadId: Uuid;
  readonly authorPersonId: Uuid;
  readonly body: string;
  readonly sentAt: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface PostMessageParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly threadId: Uuid;
  readonly authorPersonId: Uuid;
  readonly body: string;
  readonly sentAt: string;
}

/** Post a message. Immutable: body required, no update path. */
export function postMessage(params: PostMessageParams): Message {
  const body = params.body.trim();
  if (body.length === 0) {
    throw new EmptyMessageBodyError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    threadId: params.threadId,
    authorPersonId: params.authorPersonId,
    body,
    sentAt: params.sentAt,
    createdAt: now,
    updatedAt: now,
  };
}
