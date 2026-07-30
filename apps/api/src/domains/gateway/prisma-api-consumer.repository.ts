import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ApiConsumer,
  type ApiConsumerRepository,
  type AuthScheme,
  type ConsumerStatus,
} from "@knowget/gateway";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ApiConsumerRow {
  id: string;
  tenantId: string;
  organizationId: string;
  consumerKey: string;
  displayName: string;
  authScheme: string;
  credentialRef: string;
  grantedScopes: string[];
  status: string;
  ownerId: string;
  registeredBy: string | null;
  suspensionReason: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  retiredAt: string | null;
  rotatedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ApiConsumerRow): ApiConsumer {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    consumerKey: row.consumerKey,
    displayName: row.displayName,
    authScheme: row.authScheme as AuthScheme,
    credentialRef: row.credentialRef,
    grantedScopes: row.grantedScopes,
    status: row.status as ConsumerStatus,
    ownerId: row.ownerId as Uuid,
    registeredBy: (row.registeredBy as Uuid | null) ?? null,
    suspensionReason: row.suspensionReason,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    suspendedAt: (row.suspendedAt as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    rotatedAt: (row.rotatedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(consumer: ApiConsumer) {
  return {
    tenantId: consumer.tenantId,
    organizationId: consumer.organizationId,
    consumerKey: consumer.consumerKey,
    displayName: consumer.displayName,
    authScheme: consumer.authScheme,
    credentialRef: consumer.credentialRef,
    grantedScopes: [...consumer.grantedScopes],
    status: consumer.status,
    ownerId: consumer.ownerId,
    registeredBy: consumer.registeredBy,
    suspensionReason: consumer.suspensionReason,
    activatedAt: consumer.activatedAt,
    suspendedAt: consumer.suspendedAt,
    retiredAt: consumer.retiredAt,
    rotatedAt: consumer.rotatedAt,
  };
}

/**
 * Prisma-backed {@link ApiConsumerRepository} (RLS via {@link withTenant}).
 *
 * `credentialRef` is stored and the credential is not, which is this whole domain's position on secrets held in
 * one column. The reference is operational information an administrator needs in order to rotate the material it
 * points at; the material is resolved wherever the platform's secret store lives and never reaches a row. The
 * value objects refuse a plaintext-looking value on the way in, so the guarantee is enforced before persistence
 * rather than trusted at it — which matters because a gateway is the single place in a platform where a leaked
 * credential is worth the most, and a column that *sometimes* held a secret would be discovered by whoever
 * exported it, not by whoever wrote it.
 *
 * `grantedScopes` is `TEXT[]` and is written as a plain array rather than through JSON, because it is a flat list
 * of permission strings and nothing more. Storing it as JSONB would buy structure this column has no use for and
 * cost the ability to read it with an ordinary `= ANY` in a support query.
 *
 * There is no `remove`. A retired consumer keeps its row: every delivery, every ledger entry and every rate-limit
 * decision the institution ever recorded names a consumer id, and deleting the consumer would turn all of them
 * into references to nothing at exactly the moment somebody is trying to reconstruct what an integration did.
 */
export class PrismaApiConsumerRepository implements ApiConsumerRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ApiConsumer | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.apiConsumer.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The key lookup behind the one-consumer-per-key rule, and how a presented credential finds its consumer. */
  findByKey(tenantId: TenantId, consumerKey: string): Promise<ApiConsumer | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.apiConsumer.findFirst({ where: { consumerKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The consumers that may currently be admitted, which is a narrower set than the consumers that exist.
   *
   * Registered-but-not-activated is deliberately excluded. Registration records that an integrator was described;
   * activation records that somebody decided it may call. Collapsing the two would make the act of writing down a
   * planned integration the same act as switching it on.
   */
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<ApiConsumer[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.apiConsumer.findMany({
        where: { organizationId, status: "active" },
        orderBy: { consumerKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** Who is answerable for which integrations — the read behind every conversation about an unowned key. */
  listByOwner(tenantId: TenantId, ownerId: Uuid): Promise<ApiConsumer[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.apiConsumer.findMany({
        where: { ownerId },
        orderBy: { consumerKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ApiConsumer[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.apiConsumer.findMany({ orderBy: { consumerKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(consumer: ApiConsumer): Promise<void> {
    return withTenant(this.db, consumer.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(consumer);
      await tx.apiConsumer.upsert({
        where: { id: consumer.id },
        create: { id: consumer.id, ...fields },
        update: fields,
      });
    });
  }
}
