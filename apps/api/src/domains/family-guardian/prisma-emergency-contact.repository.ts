import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  EmergencyAuthorizations,
  EmergencyContact,
  EmergencyContactAttempt,
  EmergencyContactRepository,
  EmergencyContactStatus,
} from "@knowget/family-guardian";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EmergencyContactRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  personId: string;
  priority: number;
  relationshipLabel: string;
  phone: string | null;
  availabilityNote: string | null;
  authorizations: unknown;
  contactHistory: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EmergencyContactRow): EmergencyContact {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    personId: row.personId as Uuid,
    priority: row.priority,
    relationshipLabel: row.relationshipLabel,
    phone: row.phone,
    availabilityNote: row.availabilityNote,
    authorizations: row.authorizations as EmergencyAuthorizations,
    contactHistory: (row.contactHistory as EmergencyContactAttempt[]) ?? [],
    status: row.status as EmergencyContactStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(contact: EmergencyContact) {
  return {
    tenantId: contact.tenantId,
    organizationId: contact.organizationId,
    studentId: contact.studentId,
    personId: contact.personId,
    priority: contact.priority,
    relationshipLabel: contact.relationshipLabel,
    phone: contact.phone,
    availabilityNote: contact.availabilityNote,
    authorizations: JSON.parse(JSON.stringify(contact.authorizations)),
    contactHistory: JSON.parse(JSON.stringify(contact.contactHistory)),
    status: contact.status,
  };
}

/** Prisma-backed {@link EmergencyContactRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEmergencyContactRepository implements EmergencyContactRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EmergencyContact | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.emergencyContact.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<EmergencyContact[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.emergencyContact.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EmergencyContact[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.emergencyContact.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EmergencyContact[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.emergencyContact.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(contact: EmergencyContact): Promise<void> {
    return withTenant(this.db, contact.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(contact);
      await tx.emergencyContact.upsert({
        where: { id: contact.id },
        create: { id: contact.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.emergencyContact.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
