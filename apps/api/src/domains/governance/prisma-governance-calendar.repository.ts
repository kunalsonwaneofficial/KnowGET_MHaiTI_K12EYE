import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CalendarEntryStatus,
  GovernanceCalendarEntry,
  GovernanceCalendarRepository,
  GovernanceEventType,
} from "@knowget/governance";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CalendarEntryRow {
  id: string;
  tenantId: string;
  organizationId: string;
  governanceBodyId: string | null;
  committeeId: string | null;
  type: string;
  title: string;
  description: string | null;
  scheduledOn: Date;
  status: string;
  completedOn: Date | null;
  minutes: string | null;
  attendeeIds: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date): string => value.toISOString().slice(0, 10);
const toDateOrNull = (value: Date | null): string | null => (value ? toDate(value) : null);

function toDomain(row: CalendarEntryRow): GovernanceCalendarEntry {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    governanceBodyId: row.governanceBodyId as Uuid | null,
    committeeId: row.committeeId as Uuid | null,
    type: row.type as GovernanceEventType,
    title: row.title,
    description: row.description,
    scheduledOn: toDate(row.scheduledOn),
    status: row.status as CalendarEntryStatus,
    completedOn: toDateOrNull(row.completedOn),
    minutes: row.minutes,
    attendeeIds: (row.attendeeIds as Uuid[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(entry: GovernanceCalendarEntry) {
  return {
    tenantId: entry.tenantId,
    organizationId: entry.organizationId,
    governanceBodyId: entry.governanceBodyId,
    committeeId: entry.committeeId,
    type: entry.type,
    title: entry.title,
    description: entry.description,
    scheduledOn: new Date(entry.scheduledOn),
    status: entry.status,
    completedOn: entry.completedOn ? new Date(entry.completedOn) : null,
    minutes: entry.minutes,
    attendeeIds: JSON.parse(JSON.stringify(entry.attendeeIds)),
  };
}

/** Prisma-backed {@link GovernanceCalendarRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGovernanceCalendarRepository implements GovernanceCalendarRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<GovernanceCalendarEntry | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceCalendarEntry.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GovernanceCalendarEntry[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceCalendarEntry.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<GovernanceCalendarEntry[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceCalendarEntry.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(entry: GovernanceCalendarEntry): Promise<void> {
    return withTenant(this.db, entry.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(entry);
      await tx.governanceCalendarEntry.upsert({
        where: { id: entry.id },
        create: { id: entry.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.governanceCalendarEntry.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
