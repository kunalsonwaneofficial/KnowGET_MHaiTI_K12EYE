import { newCorrelationId, newUuid } from "@knowget/shared";
import type { CorrelationId, Uuid } from "@knowget/types";

/** Identifier generation abstraction (test-swappable). */
export interface IdService {
  newId(): Uuid;
  newCorrelationId(): CorrelationId;
}

export class UuidIdService implements IdService {
  newId(): Uuid {
    return newUuid();
  }

  newCorrelationId(): CorrelationId {
    return newCorrelationId();
  }
}
