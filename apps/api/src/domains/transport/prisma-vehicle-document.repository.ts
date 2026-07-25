import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { DocumentType, VehicleDocument, VehicleDocumentRepository } from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface VehicleDocumentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  vehicleId: string;
  type: string;
  documentNumber: string;
  issuedOn: string;
  expiresOn: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: VehicleDocumentRow): VehicleDocument {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    vehicleId: row.vehicleId as Uuid,
    type: row.type as DocumentType,
    documentNumber: row.documentNumber,
    issuedOn: row.issuedOn,
    expiresOn: row.expiresOn,
    notes: row.notes,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(document: VehicleDocument) {
  return {
    tenantId: document.tenantId,
    organizationId: document.organizationId,
    vehicleId: document.vehicleId,
    type: document.type,
    documentNumber: document.documentNumber,
    issuedOn: document.issuedOn,
    expiresOn: document.expiresOn,
    notes: document.notes,
  };
}

/** Prisma-backed {@link VehicleDocumentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaVehicleDocumentRepository implements VehicleDocumentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<VehicleDocument | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.vehicleDocument.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByVehicleAndType(
    tenantId: TenantId,
    vehicleId: Uuid,
    type: string,
  ): Promise<VehicleDocument | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.vehicleDocument.findFirst({
        where: { vehicleId, type, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<VehicleDocument[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicleDocument.findMany({ where: { vehicleId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<VehicleDocument[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicleDocument.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<VehicleDocument[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.vehicleDocument.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(document: VehicleDocument): Promise<void> {
    return withTenant(this.db, document.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(document);
      await tx.vehicleDocument.upsert({
        where: { id: document.id },
        create: { id: document.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.vehicleDocument.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
