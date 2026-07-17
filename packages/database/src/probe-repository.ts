import { validateEntity } from "@knowget/persistence";
import { z } from "zod";
import { createRepository, type PrismaRepository } from "./prisma-repository";

/** Validation schema for creating a DataProbe fixture row. */
export const dataProbeCreateSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  value: z.string().optional(),
});

export type DataProbeCreateInput = z.infer<typeof dataProbeCreateSchema>;

/** Shape of a DataProbe row exposed by the repository. */
export interface DataProbeEntity {
  id: string;
  tenantId: string;
  name: string;
  value: string | null;
  deletedAt: Date | null;
}

/** Validate input for creating a DataProbe row. */
export function validateDataProbeCreate(data: unknown): DataProbeCreateInput {
  return validateEntity(dataProbeCreateSchema, data);
}

/**
 * Build a soft-delete-enabled repository for the DataProbe fixture over a Prisma
 * client or transaction delegate (e.g. `service.client.dataProbe` or
 * `tx.dataProbe`).
 */
export function dataProbeRepository(
  delegate: unknown,
): PrismaRepository<DataProbeEntity, DataProbeCreateInput, Partial<DataProbeCreateInput>> {
  return createRepository<DataProbeEntity, DataProbeCreateInput, Partial<DataProbeCreateInput>>(
    delegate,
    { softDelete: true },
  );
}
