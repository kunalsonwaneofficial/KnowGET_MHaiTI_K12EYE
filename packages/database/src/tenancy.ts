import { runtimeContextStore, type RuntimeContextStore } from "@knowget/context";
import { PlatformError } from "@knowget/exceptions";
import type { PrismaService } from "./prisma-service";
import type { TransactionClient } from "./transaction-manager";

/** Raised when tenant-scoped work runs without a tenant in context. */
export class MissingTenantError extends PlatformError {
  constructor(message = "No tenant is present in the current context") {
    super(message, { code: "VALIDATION_ERROR", httpStatus: 400, isOperational: true });
  }
}

/**
 * Run `work` in a transaction whose PostgreSQL session is scoped to `tenantId`
 * (`set_config('app.current_tenant', …)`), so Row-Level Security isolates every
 * read and write to that tenant. This is the application-context half of the
 * hybrid app-context + RLS multi-tenancy model.
 */
export async function withTenant<T>(
  service: PrismaService,
  tenantId: string,
  work: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return service.client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return work(tx);
  });
}

/** Resolve the tenant from the runtime context and run tenant-scoped work. */
export function withCurrentTenant<T>(
  service: PrismaService,
  work: (tx: TransactionClient) => Promise<T>,
  contextStore: RuntimeContextStore = runtimeContextStore,
): Promise<T> {
  const tenantId = contextStore.get()?.tenantId;
  if (!tenantId) {
    throw new MissingTenantError();
  }
  return withTenant(service, tenantId, work);
}
