import type { Principal } from "@knowget/auth";
import { ValidationError } from "@knowget/exceptions";
import type { TenantId } from "@knowget/types";

/**
 * Permissions gating the knowledge-graph REST surface. Two scope pairs split the surface: `ontology:*` covers
 * the schema of the graph — the entity types and relationship types a tenant registers (an administrative,
 * governed surface); `knowledge:*` covers the graph content — the entities, semantic relationships, assertions
 * (the evidence chain) and the derived digital memory. The two are separately administered, so they do not
 * share a scope. Nothing here is predictive — forecasting is P2-D28; LLMs/agents are P2-D26.
 */
export const ONTOLOGY_READ = "ontology:read";
export const ONTOLOGY_WRITE = "ontology:write";
export const KNOWLEDGE_READ = "knowledge:read";
export const KNOWLEDGE_WRITE = "knowledge:write";

interface ZodLike<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false; error: { issues: unknown } };
}

/** Parse a request body with a zod schema, mapping failure to a 400 ValidationError. */
export function parseBody<T>(schema: ZodLike<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Invalid request body", { details: { issues: result.error.issues } });
  }
  return result.data;
}

/** The tenant of the current principal, or a 400 when none is associated. */
export function tenantOf(principal: Principal): TenantId {
  if (!principal.tenantId) {
    throw new ValidationError("No tenant is associated with the current principal");
  }
  return principal.tenantId;
}
