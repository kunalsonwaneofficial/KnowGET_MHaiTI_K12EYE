import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CompetencyRating,
  Observation,
  ObservationRepository,
  ObservationStatus,
  ObservationType,
} from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ObservationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  frameworkId: string;
  employeeId: string;
  observerId: string;
  observationType: string;
  observedOn: string;
  context: string | null;
  ratings: unknown;
  overallRating: number | null;
  strengths: string | null;
  growthAreas: string | null;
  status: string;
  sharedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ObservationRow): Observation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    frameworkId: row.frameworkId as Uuid,
    employeeId: row.employeeId as Uuid,
    observerId: row.observerId as Uuid,
    observationType: row.observationType as ObservationType,
    observedOn: row.observedOn,
    context: row.context,
    ratings: (row.ratings as CompetencyRating[]) ?? [],
    overallRating: row.overallRating,
    strengths: row.strengths,
    growthAreas: row.growthAreas,
    status: row.status as ObservationStatus,
    sharedAt: row.sharedAt,
    acknowledgedAt: row.acknowledgedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(observation: Observation) {
  return {
    tenantId: observation.tenantId,
    organizationId: observation.organizationId,
    frameworkId: observation.frameworkId,
    employeeId: observation.employeeId,
    observerId: observation.observerId,
    observationType: observation.observationType,
    observedOn: observation.observedOn,
    context: observation.context,
    ratings: JSON.parse(JSON.stringify(observation.ratings)),
    overallRating: observation.overallRating,
    strengths: observation.strengths,
    growthAreas: observation.growthAreas,
    status: observation.status,
    sharedAt: observation.sharedAt,
    acknowledgedAt: observation.acknowledgedAt,
  };
}

/** Prisma-backed {@link ObservationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaObservationRepository implements ObservationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Observation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.observation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Observation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.observation.findMany({ where: { employeeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByObserver(tenantId: TenantId, observerId: Uuid): Promise<Observation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.observation.findMany({ where: { observerId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Observation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.observation.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Observation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.observation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(observation: Observation): Promise<void> {
    return withTenant(this.db, observation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(observation);
      await tx.observation.upsert({
        where: { id: observation.id },
        create: { id: observation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.observation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
