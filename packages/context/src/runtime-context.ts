import { newCorrelationId, nowIso } from "@knowget/shared";
import type { CorrelationId, ISODateString, TenantId, Uuid } from "@knowget/types";

/**
 * Ambient context for a unit of work (a request, job, or event handler). Tenant
 * and user fields are placeholders here — populated by the identity/tenancy
 * layers in later phases — but the shape is fixed now so multi-tenancy needs no
 * redesign.
 */
export interface RuntimeContext {
  readonly correlationId: CorrelationId;
  readonly requestId?: Uuid;
  readonly traceId?: string;
  readonly tenantId?: TenantId;
  readonly userId?: Uuid;
  readonly locale?: string;
  readonly timeZone?: string;
  readonly startedAt: ISODateString;
}

/** Build a runtime context, defaulting the correlation id and start time. */
export function createRuntimeContext(partial: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    ...partial,
    correlationId: partial.correlationId ?? newCorrelationId(),
    startedAt: partial.startedAt ?? nowIso(),
  };
}
