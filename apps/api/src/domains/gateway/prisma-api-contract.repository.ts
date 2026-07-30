import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ApiContract,
  type ApiContractRepository,
  type ContractStatus,
  type ContractStyle,
} from "@knowget/gateway";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ApiContractRow {
  id: string;
  tenantId: string;
  organizationId: string;
  capabilityKey: string;
  contractVersion: string;
  title: string;
  summary: string;
  style: string;
  status: string;
  specificationRef: string;
  publishedAt: string | null;
  publishedBy: string | null;
  deprecatedAt: string | null;
  sunsetAt: string | null;
  supersededByVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ApiContractRow): ApiContract {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    capabilityKey: row.capabilityKey,
    contractVersion: row.contractVersion,
    title: row.title,
    summary: row.summary,
    style: row.style as ContractStyle,
    status: row.status as ContractStatus,
    specificationRef: row.specificationRef,
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    publishedBy: (row.publishedBy as Uuid | null) ?? null,
    deprecatedAt: (row.deprecatedAt as ISODateString | null) ?? null,
    sunsetAt: (row.sunsetAt as ISODateString | null) ?? null,
    supersededByVersion: row.supersededByVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(contract: ApiContract) {
  return {
    tenantId: contract.tenantId,
    organizationId: contract.organizationId,
    capabilityKey: contract.capabilityKey,
    contractVersion: contract.contractVersion,
    title: contract.title,
    summary: contract.summary,
    style: contract.style,
    status: contract.status,
    specificationRef: contract.specificationRef,
    publishedAt: contract.publishedAt,
    publishedBy: contract.publishedBy,
    deprecatedAt: contract.deprecatedAt,
    sunsetAt: contract.sunsetAt,
    supersededByVersion: contract.supersededByVersion,
  };
}

/** The port's documented order for one capability's versions: code-point ascending, exactly as in memory. */
function byContractVersion(left: ApiContract, right: ApiContract): number {
  return left.contractVersion < right.contractVersion ? -1 : 1;
}

/**
 * Prisma-backed {@link ApiContractRepository} (RLS via {@link withTenant}).
 *
 * `listServable` spells out `published` and `deprecated` rather than deriving them, and the duplication is the
 * point: the pure servability predicate and this `IN` list are two statements of one rule and they have to
 * agree. A deprecated version still answers — that is what a notice period *is* — while a sunset version is a
 * record of something that used to answer. Folding deprecated out of the servable set would sunset every
 * version the moment it was deprecated, which is the one thing a notice period exists to prevent.
 *
 * Two kinds of ordering appear below and they are not the same commitment. `listByCapability` is documented by
 * the port as code-point ascending on the version, so it is sorted here against exactly the comparator the
 * in-memory repository uses. A SQL `ORDER BY` would instead give whatever the database's collation says, and a
 * collation that treats `-` and `.` as variable-weight orders `1-0` against `10` differently from the port's
 * contract while looking correct in every test that runs in memory. One capability's version list is bounded by
 * how many versions that capability has ever had, so the sort costs nothing. The other reads have no documented
 * order at all, and there a stable SQL `ORDER BY` is the right answer: it need only be deterministic, and
 * capability-then-version is the order somebody opening a list of contracts is expecting to read.
 *
 * There is no `remove`. A sunset contract keeps its row because an integrator's code outlives their integration,
 * and the question *what did version 2 promise* is asked most often by whoever has just discovered that
 * something of theirs still calls it.
 */
export class PrismaApiContractRepository implements ApiContractRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ApiContract | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.apiContract.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The lookup a version-negotiating caller resolves to, and the guard behind one contract per version. */
  findByCapabilityAndVersion(
    tenantId: TenantId,
    capabilityKey: string,
    contractVersion: string,
  ): Promise<ApiContract | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.apiContract.findFirst({ where: { capabilityKey, contractVersion } });
      return row ? toDomain(row) : null;
    });
  }

  /** Every version of one capability, in the port's order — the input to version negotiation. */
  listByCapability(tenantId: TenantId, capabilityKey: string): Promise<ApiContract[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.apiContract.findMany({ where: { capabilityKey } });
      return rows.map(toDomain).sort(byContractVersion);
    });
  }

  /**
   * What actually answers right now, which is a smaller set than what has been published.
   *
   * This is the read a caller's own capability discovery is built on, so its boundaries are the platform's
   * public promise: a draft is not yet a promise and a sunset version is no longer one.
   */
  listServable(tenantId: TenantId, organizationId: Uuid): Promise<ApiContract[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.apiContract.findMany({
        where: { organizationId, status: { in: ["published", "deprecated"] } },
        orderBy: [{ capabilityKey: "asc" }, { contractVersion: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  /**
   * The notice period made visible across the whole estate rather than one capability at a time.
   *
   * A deprecation with a sunset date and no worklist is an intention rather than a notice, and the difference
   * surfaces on the morning the date passes and something nobody was tracking stops answering.
   */
  listDeprecated(tenantId: TenantId, organizationId: Uuid): Promise<ApiContract[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.apiContract.findMany({
        where: { organizationId, status: "deprecated" },
        orderBy: [{ capabilityKey: "asc" }, { contractVersion: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ApiContract[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.apiContract.findMany({
        orderBy: [{ capabilityKey: "asc" }, { contractVersion: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(contract: ApiContract): Promise<void> {
    return withTenant(this.db, contract.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(contract);
      await tx.apiContract.upsert({
        where: { id: contract.id },
        create: { id: contract.id, ...fields },
        update: fields,
      });
    });
  }
}
